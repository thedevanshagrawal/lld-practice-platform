import { describe, it, expect } from 'vitest';

import type { CriterionResult } from '@/domain/evaluation/CriterionResult';
import { computeOverallScore } from '@/domain/rubric/scoring';
import { criterionKeysFor } from '@/domain/rubric/Rubric';
import { GeminiEvaluator } from '@/infrastructure/evaluators/GeminiEvaluator';
import type { GeminiClient } from '@/infrastructure/evaluators/GeminiClient';
import { PARKING_LOT } from '@/seed/problems';
import { MVP_RUBRIC } from '@/seed/rubric';

import weakResponse from '../fixtures/gemini/parking-lot-weak.response.json';
import strongResponse from '../fixtures/gemini/parking-lot-strong.response.json';

import { strongParkingLotContent, weakParkingLotContent } from '../support/content';
import { ScriptedGeminiClient, noSleep } from '../support/fakes';

const LLM_KEYS = criterionKeysFor(MVP_RUBRIC, 'llm');

function evaluatorFor(client: GeminiClient): GeminiEvaluator {
  return new GeminiEvaluator(client, { sleep: noSleep, retryDelayMs: 1 });
}

async function evaluate(rawText: string, content: ReturnType<typeof weakParkingLotContent>) {
  const client = new ScriptedGeminiClient([rawText]);
  const output = await evaluatorFor(client).evaluate({
    problem: PARKING_LOT,
    rubric: MVP_RUBRIC,
    criterionKeys: LLM_KEYS,
    content,
  });
  return { output, client };
}

function scored(results: readonly CriterionResult[]): CriterionResult[] {
  return results.filter((r) => r.score !== null);
}

describe('GeminiEvaluator against recorded fixtures', () => {
  it('maps a well-formed response to CriterionResult[] with evidence intact', async () => {
    const { output, client } = await evaluate(
      (weakResponse as { rawText: string }).rawText,
      weakParkingLotContent(),
    );

    expect(client.callCount).toBe(1);
    expect(output.tag).toBe('llm');
    expect(output.results).toHaveLength(LLM_KEYS.length);
    expect(output.results.map((r) => r.criterionKey)).toEqual([...LLM_KEYS]);
    // No score without evidence, and no evidence without a suggestion to act on.
    expect(output.results.every((r) => r.evidence.trim().length > 0)).toBe(true);
    expect(output.results.every((r) => r.suggestion.trim().length > 0)).toBe(true);
  });

  /**
   * ANTI-SYCOPHANCY, lower anchor.
   *
   * The weak fixture is one god class, tautological responsibilities, an undirected
   * relationship hub, a name-dropped singleton and no extensibility answer. If a prompt
   * edit makes the model generous, the fixture has to be re-recorded and the inflated
   * scores become visible in the diff. That is the whole mechanism: this test turns
   * silent quality drift into a reviewable change.
   */
  it('does not score a deliberately weak submission highly', async () => {
    const { output } = await evaluate(
      (weakResponse as { rawText: string }).rawText,
      weakParkingLotContent(),
    );

    for (const result of scored(output.results)) {
      expect(result.score).toBeLessThanOrEqual(2);
      expect(result.evidence.trim().length).toBeGreaterThan(0);
      // Weak work must name a concern. A score with no stated problem is a vibe.
      expect(result.concern.trim().length).toBeGreaterThan(0);
    }

    const overall = computeOverallScore(MVP_RUBRIC, output.results);
    expect(overall.weighted).not.toBeNull();
    expect(overall.weighted!).toBeLessThanOrEqual(2);
  });

  it('reports the unevidenced criterion as null rather than inventing a score for it', async () => {
    const { output } = await evaluate(
      (weakResponse as { rawText: string }).rawText,
      weakParkingLotContent(),
    );

    const extensibility = output.results.find((r) => r.criterionKey === 'extensibility')!;
    expect(extensibility.score).toBeNull();
    expect(extensibility.score).not.toBe(0);
    expect(extensibility.evidence.startsWith('NO EVIDENCE:')).toBe(true);
  });

  /**
   * ANTI-SYCOPHANCY, upper anchor.
   *
   * A rubric that scores everything low is exactly as broken as one that scores
   * everything high, and the weak fixture alone cannot tell the two apart. This is the
   * calibration half of the pair: without it, "score everything 1" passes the suite.
   */
  it('does score a genuinely strong submission well', async () => {
    const { output } = await evaluate(
      (strongResponse as { rawText: string }).rawText,
      strongParkingLotContent(),
    );

    expect(output.results).toHaveLength(LLM_KEYS.length);
    const scoredResults = scored(output.results);
    expect(scoredResults).toHaveLength(LLM_KEYS.length);

    for (const result of scoredResults) {
      expect(result.score).toBeGreaterThanOrEqual(3);
    }

    const overall = computeOverallScore(MVP_RUBRIC, output.results);
    expect(overall.weighted!).toBeGreaterThanOrEqual(3);
  });

  it('separates the two anchors by a margin a low-scoring rubric could not fake', async () => {
    const weak = await evaluate(
      (weakResponse as { rawText: string }).rawText,
      weakParkingLotContent(),
    );
    const strong = await evaluate(
      (strongResponse as { rawText: string }).rawText,
      strongParkingLotContent(),
    );

    const weakOverall = computeOverallScore(MVP_RUBRIC, weak.output.results).weighted!;
    const strongOverall = computeOverallScore(MVP_RUBRIC, strong.output.results).weighted!;

    expect(strongOverall - weakOverall).toBeGreaterThanOrEqual(2);
  });
});

describe('GeminiEvaluator evidence enforcement', () => {
  /**
   * The model returns a confident 4 with a quote the learner never wrote. This is the
   * single failure mode the whole platform is built against, and the correct handling
   * is narrow: force THAT criterion to null, keep everything else, and say why.
   *
   * Forcing it to 0 would be a different lie — "the learner did this badly" instead of
   * "we could not verify this". Dropping it silently would be worse still: the learner
   * would never learn the claim was made.
   */
  function fabricatedEvidenceResponse(): string {
    const parsed = structuredClone(
      (weakResponse as { parsed: { results: Record<string, unknown>[] } }).parsed,
    );
    const target = parsed.results.find((r) => r.criterionKey === 'abstraction_and_interfaces')!;
    target.score = 4;
    target.evidence =
      'The learner writes that a PricingPolicy interface separates hourly from flat-rate fees, which is a well-earned abstraction.';
    target.concern = 'None material; the abstraction is justified by a named force.';
    target.confidence = 'high';
    return JSON.stringify(parsed);
  }

  it('forces an unverifiable score to null — not to 0, and not dropped', async () => {
    const { output } = await evaluate(fabricatedEvidenceResponse(), weakParkingLotContent());

    // NOT dropped: the rubric still gets one result per criterion.
    expect(output.results).toHaveLength(LLM_KEYS.length);

    const abstraction = output.results.find((r) => r.criterionKey === 'abstraction_and_interfaces')!;
    expect(abstraction.score).toBeNull();
    expect(abstraction.score).not.toBe(0);
    expect(abstraction.evidence.startsWith('NO EVIDENCE:')).toBe(true);
    // The rejected quote is kept, so the fabrication rate is measurable across releases.
    expect(abstraction.evidence).toContain('PricingPolicy');
    expect(abstraction.concern.trim().length).toBeGreaterThan(0);
  });

  it('leaves the other criteria untouched when one is rejected', async () => {
    const { output } = await evaluate(fabricatedEvidenceResponse(), weakParkingLotContent());

    const requirements = output.results.find(
      (r) => r.criterionKey === 'requirements_and_assumptions',
    )!;
    expect(requirements.score).toBe(1);
    expect(requirements.evidence).toContain('The parking lot has cars.');
  });

  it('withholds the aggregate rather than publishing one built on rejected evidence', async () => {
    const { output } = await evaluate(fabricatedEvidenceResponse(), weakParkingLotContent());

    const overall = computeOverallScore(MVP_RUBRIC, output.results);
    // Three of five still scored, so a renormalised aggregate is honest here — but it
    // must be computed over the surviving weight, not over all five criteria.
    expect(overall.assessedWeight).toBeCloseTo(0.65, 10);
    expect(overall.weighted).toBe(1);
  });
});
