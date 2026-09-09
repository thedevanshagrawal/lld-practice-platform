import { describe, it, expect } from 'vitest';

import { GeminiEvaluator } from '@/infrastructure/evaluators/GeminiEvaluator';
import { DeterministicEvaluator } from '@/infrastructure/evaluators/DeterministicEvaluator';
import type { GeminiClient } from '@/infrastructure/evaluators/GeminiClient';

import malformedProse from '../fixtures/gemini/malformed-prose.response.json';
import malformedTruncated from '../fixtures/gemini/malformed-truncated.response.json';
import malformedWrongShape from '../fixtures/gemini/malformed-wrong-shape.response.json';

import { weakParkingLotContent } from '../support/content';
import {
  ScriptedGeminiClient,
  networkErrorGeminiClient,
  noSleep,
  timingOutGeminiClient,
} from '../support/fakes';
import { LEARNER_ID, PROBLEM_ID, makeWorld } from '../support/world';

/**
 * THE reliability suite.
 *
 * Every seeded rubric criterion is `assessedBy: 'llm'`, so a Gemini failure means the
 * stored Evaluation carries NO scores at all. That makes the question sharp rather than
 * academic: when the model is down, what does the learner still have?
 *
 * The answer this suite pins down is: the submission, the attempt in a re-runnable
 * FAILED state, a stated failure reason, an Evaluation record with an HONEST null
 * overall, and the deterministic structural findings themselves, recomputed on read
 * and served to the learner even when the model scored nothing at all.
 */

function evaluatorFor(client: GeminiClient): GeminiEvaluator {
  return new GeminiEvaluator(client, {
    // Injected so the retry path runs at full speed and the suite never sleeps.
    sleep: noSleep,
    retryDelayMs: 1,
    perCallTimeoutMs: 5_000,
    totalBudgetMs: 30_000,
  });
}

async function submitAndRun(client: GeminiClient) {
  const world = makeWorld({ evaluators: [evaluatorFor(client)] });
  const { attemptId } = await world.start.execute({
    learnerId: LEARNER_ID,
    problemId: PROBLEM_ID,
  });
  await world.submit.execute({
    attemptId,
    content: weakParkingLotContent(),
    idempotencyKey: 'k-1',
  });
  const result = await world.run.execute({ attemptId });
  return { world, attemptId, result };
}

describe('Evaluation pipeline when Gemini fails', () => {
  it('marks the attempt FAILED when the Gemini evaluator times out', async () => {
    const client = timingOutGeminiClient();
    const { world, attemptId, result } = await submitAndRun(client);

    expect(result.status).toBe('FAILED');
    const attempt = await world.attempts.findById(attemptId);
    expect(attempt?.status).toBe('FAILED');
    expect(attempt?.failureReason).toMatch(/timeout|timed out/i);

    // One retry, then it gives up. Not zero (the retry policy would be dead code) and
    // not three (the learner would wait for a model that is plainly not answering).
    expect(client.callCount).toBe(2);
  });

  it('marks the attempt FAILED when the Gemini evaluator dies at the transport layer', async () => {
    const client = networkErrorGeminiClient();
    const { result } = await submitAndRun(client);

    expect(result.status).toBe('FAILED');
    expect(client.callCount).toBe(2);
  });

  it('still has the learner submission persisted after a Gemini timeout', async () => {
    const { world, attemptId } = await submitAndRun(timingOutGeminiClient());

    const attempt = await world.attempts.findById(attemptId);
    expect(attempt?.submission).toBeTruthy();
    expect(attempt?.submission?.id).toBe('sub-1');
    expect(attempt?.submission?.content.toEvaluationText()).toContain('ParkingLot');
  });

  /**
   * A failed run is degraded, NOT unevaluable.
   *
   * NOT_EVALUABLE is reserved for a submission the platform declines to evaluate on its
   * own merits (a deterministic blocker). Reporting a Gemini outage as NOT_EVALUABLE
   * tells the learner their design was the problem when the vendor was.
   */
  it('records the timeout as PARTIAL, not NOT_EVALUABLE — an outage is our fault, not the learner\'s', async () => {
    const { world, attemptId, result } = await submitAndRun(timingOutGeminiClient());

    expect(result.outcome).toBe('PARTIAL');

    const stored = await world.evaluations.findLatestByAttemptId(attemptId);
    expect(stored).toBeTruthy();
    expect(stored?.outcome).toBe('PARTIAL');
    expect(stored?.failures.map((f) => f.tag)).toContain('llm');
  });

  it('reports a null overall score after a timeout rather than a zero', async () => {
    const { world, attemptId } = await submitAndRun(timingOutGeminiClient());

    const stored = await world.evaluations.findLatestByAttemptId(attemptId);
    expect(stored?.overall.weighted).toBeNull();
    expect(stored?.overall.weighted).not.toBe(0);
    expect(stored?.overall.assessedWeight).toBe(0);
  });

  it('leaves the failed attempt re-runnable without a re-submission', async () => {
    const { world, attemptId } = await submitAndRun(timingOutGeminiClient());

    const view = await world.getAttempt.execute({ attemptId });
    expect(view.status).toBe('FAILED');
    expect(view.canRetryEvaluation).toBe(true);
    // FAILED means "our verdict is incomplete", never "your work is gone".
    expect(view.content).not.toBeNull();
    expect(view.evaluation).not.toBeNull();
    expect(view.failureReason).toBeTruthy();
  });

  it('produces a second, independent run when the failed attempt is retried', async () => {
    const client = new ScriptedGeminiClient([
      new Error('boom'),
      new Error('boom'),
      (malformedProse as { rawText: string }).rawText,
    ]);
    const world = makeWorld({ evaluators: [evaluatorFor(client)] });
    const { attemptId } = await world.start.execute({
      learnerId: LEARNER_ID,
      problemId: PROBLEM_ID,
    });
    await world.submit.execute({
      attemptId,
      content: weakParkingLotContent(),
      idempotencyKey: 'k-1',
    });

    const first = await world.run.execute({ attemptId });
    expect(first.status).toBe('FAILED');

    const second = await world.run.execute({ attemptId });
    expect(second.runNumber).toBe(2);
    expect(second.status).toBe('COMPLETED');

    // Append-only: the degraded first run stays auditable next to the successful second.
    expect(world.evaluations.findAllByAttemptId(attemptId)).toHaveLength(2);
  });
});

describe('Evaluation pipeline against malformed Gemini output', () => {
  it('salvages prose-wrapped JSON with no extra API call', async () => {
    const client = new ScriptedGeminiClient([(malformedProse as { rawText: string }).rawText]);
    const { world, attemptId, result } = await submitAndRun(client);

    // The fixture's own expectation: salvages, validates, repairCalls 0.
    expect(client.callCount).toBe(1);
    expect(result.outcome).toBe('COMPLETE');
    expect(result.status).toBe('COMPLETED');

    const stored = await world.evaluations.findLatestByAttemptId(attemptId);
    expect(stored?.results).toHaveLength(5);
  });

  it('does not crash on truncated JSON, and never guesses the missing tail', async () => {
    const client = new ScriptedGeminiClient([(malformedTruncated as { rawText: string }).rawText]);
    const { world, attemptId, result } = await submitAndRun(client);

    // One original call plus exactly one structure-only repair call. No repair loop.
    expect(client.callCount).toBe(2);
    expect(result.status).toBe('FAILED');

    const stored = await world.evaluations.findLatestByAttemptId(attemptId);
    // Nothing was invented: no scores were scraped out of the broken text.
    expect(stored?.results).toHaveLength(0);
    expect(stored?.overall.weighted).toBeNull();

    const attempt = await world.attempts.findById(attemptId);
    expect(attempt?.submission?.id).toBe('sub-1');
  });

  it('does not crash on JSON of the wrong shape, and rejects the global score field', async () => {
    const raw = (malformedWrongShape as { rawText: string }).rawText;
    // The fixture is dangerous precisely because it parses. Ajv is the only thing
    // standing between a 100-point headline number and the database.
    expect(raw).toContain('overallScore');

    const client = new ScriptedGeminiClient([raw]);
    const { world, attemptId, result } = await submitAndRun(client);

    expect(client.callCount).toBe(2);
    expect(result.status).toBe('FAILED');

    const stored = await world.evaluations.findLatestByAttemptId(attemptId);
    expect(stored?.results).toHaveLength(0);
    expect(stored?.failures.map((f) => f.reason).join(' ')).toMatch(/invalid|schema|additional/i);
  });
});

describe('What the learner still has after a Gemini outage', () => {
  /**
   * The deterministic structural findings survive the outage because the CONTENT
   * survives it: `GetAttempt` returns the stored `SubmissionContent`, and
   * `DeterministicEvaluator` is a pure function of that content with no I/O and no
   * dependency on the evaluation record.
   *
   * This test proves the data is intact and derivable. The test below it proves the
   * learner is actually shown it, which is the part that makes the reliability claim
   * in the design note true rather than aspirational.
   */
  it('keeps the submission content from which deterministic findings are fully recomputable', async () => {
    const { world, attemptId } = await submitAndRun(timingOutGeminiClient());

    const view = await world.getAttempt.execute({ attemptId });
    expect(view.content).not.toBeNull();

    const report = new DeterministicEvaluator().run(view.content!);

    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.every((f) => f.message.trim().length > 0)).toBe(true);
    // The weak fixture's nine-method ParkingLot is still detectable with zero LLM involvement.
    expect(report.godObjectClassNames).toContain('ParkingLot');
    expect(report.findings.map((f) => f.checkId)).toEqual(['D1', 'D2', 'D3', 'D4']);
  });

  it('serves structural findings on the read path when the model produced no results at all', async () => {
    const { world, attemptId } = await submitAndRun(timingOutGeminiClient());

    const view = await world.getAttempt.execute({ attemptId });

    // The attempt failed and the model scored nothing. This is the whole point: the
    // learner must still receive something they can act on.
    expect(view.status).toBe('FAILED');
    expect(view.evaluation?.results ?? []).toHaveLength(0);

    expect(view.structuralFindings.length).toBeGreaterThan(0);
    expect(view.structuralFindings.map((f) => f.checkId)).toEqual(['D1', 'D2', 'D3', 'D4']);
    expect(view.structuralFindings.every((f) => f.message.trim().length > 0)).toBe(true);

    // Findings are measured facts, never scores. Nothing on a finding may look like one.
    for (const finding of view.structuralFindings) {
      expect(finding).not.toHaveProperty('score');
      expect(['blocker', 'warning', 'info']).toContain(finding.severity);
    }

    // And the retry affordance is still there, so this is a recoverable state.
    expect(view.canRetryEvaluation).toBe(true);
  });

  it('returns no structural findings when there is no submission to measure', async () => {
    const world = makeWorld();
    const { attemptId } = await world.start.execute({
      learnerId: LEARNER_ID,
      problemId: PROBLEM_ID,
    });

    const view = await world.getAttempt.execute({ attemptId });

    expect(view.status).toBe('DRAFT');
    expect(view.structuralFindings).toEqual([]);
  });
});
