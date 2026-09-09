import { describe, it, expect } from 'vitest';

import { Attempt } from '@/domain/attempt/Attempt';
import { assembleEvaluation } from '@/domain/evaluation/Evaluation';
import { createCriterionResult } from '@/domain/evaluation/CriterionResult';
import { GetHistory } from '@/application/GetHistory';
import { InMemoryAttemptRepository } from '@/infrastructure/memory/InMemoryAttemptRepository';
import { InMemoryEvaluationRepository } from '@/infrastructure/memory/InMemoryEvaluationRepository';
import { InMemoryProblemRepository } from '@/infrastructure/memory/InMemoryProblemRepository';
import { InMemoryRubricRepository } from '@/infrastructure/memory/InMemoryRubricRepository';
import { PARKING_LOT } from '@/seed/problems';
import { MVP_RUBRIC } from '@/seed/rubric';

import { weakParkingLotContent } from '../support/content';

const LEARNER = 'learner-1';

/** attempt n's scores, keyed by criterion. `null` means the criterion was not scored. */
type ScoreSheet = Record<string, number | null>;

const ATTEMPT_1: ScoreSheet = {
  requirements_and_assumptions: 1,
  responsibilities_and_decomposition: 1,
  coupling_and_cohesion: 3,
  abstraction_and_interfaces: 2,
  extensibility: 1,
};

const ATTEMPT_2: ScoreSheet = {
  requirements_and_assumptions: 3,
  responsibilities_and_decomposition: 2,
  // Regression. This is the one the whole test exists for: telling a learner they
  // improved when they got worse is worse than showing no history at all.
  coupling_and_cohesion: 1,
  abstraction_and_interfaces: 2,
  extensibility: null,
};

function resultsFrom(sheet: ScoreSheet) {
  return MVP_RUBRIC.criteria.map((criterion) => {
    const score = sheet[criterion.key] ?? null;
    return createCriterionResult({
      criterionKey: criterion.key,
      score,
      evidence:
        score === null
          ? 'NO EVIDENCE: the submission does not address this dimension.'
          : 'The parking lot has cars.',
      concern: 'Recorded so the result is constructible; wording is not under test.',
      suggestion: 'Name the classes that change under a new requirement.',
      confidence: 0.6,
    });
  });
}

function completedAttempt(attemptNumber: number, sheet: ScoreSheet) {
  const attemptId = `att-${attemptNumber}`;
  const evaluationId = `eval-${attemptNumber}`;

  const attempt = Attempt.start({
    id: attemptId,
    learnerId: LEARNER,
    problemId: PARKING_LOT.id,
    attemptNumber,
    createdAt: new Date(`2026-09-1${attemptNumber}T09:00:00.000Z`),
  });
  attempt.submit({
    id: `sub-${attemptNumber}`,
    attemptId,
    content: weakParkingLotContent(),
    submittedAt: new Date(`2026-09-1${attemptNumber}T10:00:00.000Z`),
    idempotencyKey: `key-${attemptNumber}`,
  });
  attempt.beginEvaluation();
  attempt.completeEvaluation(evaluationId);

  const evaluation = assembleEvaluation({
    id: evaluationId,
    attemptId,
    rubric: MVP_RUBRIC,
    runNumber: 1,
    outputs: [{ tag: 'llm', adapter: 'stub', results: resultsFrom(sheet) }],
    failures: [],
    createdAt: new Date(`2026-09-1${attemptNumber}T10:00:30.000Z`),
  });

  return { attempt, evaluation };
}

async function historyWorld() {
  const first = completedAttempt(1, ATTEMPT_1);
  const second = completedAttempt(2, ATTEMPT_2);

  // Seeded newest-first on purpose: the ordering guarantee must come from the code,
  // not from the order the fake happened to be filled.
  const attempts = new InMemoryAttemptRepository([second.attempt, first.attempt]);
  const evaluations = new InMemoryEvaluationRepository([second.evaluation, first.evaluation]);

  const getHistory = new GetHistory({
    attempts,
    evaluations,
    problems: new InMemoryProblemRepository([PARKING_LOT]),
    rubrics: new InMemoryRubricRepository([MVP_RUBRIC]),
  });

  return getHistory.execute({ learnerId: LEARNER, problemId: PARKING_LOT.id });
}

describe('GetHistory', () => {
  it('returns attempts in ascending attempt order regardless of storage order', async () => {
    const history = await historyWorld();

    expect(history.attempts.map((a) => a.attemptNumber)).toEqual([1, 2]);
    expect(history.attempts.map((a) => a.attemptId)).toEqual(['att-1', 'att-2']);
    expect(history.attempts.every((a) => a.status === 'COMPLETED')).toBe(true);
  });

  it('reports one movement per rubric criterion, in rubric order', async () => {
    const history = await historyWorld();

    expect(history.movements.map((m) => m.criterionKey)).toEqual(
      MVP_RUBRIC.criteria.map((c) => c.key),
    );
  });

  it('exposes per-criterion score movement between consecutive attempts', async () => {
    const history = await historyWorld();

    const requirements = history.movements.find(
      (m) => m.criterionKey === 'requirements_and_assumptions',
    )!;

    expect(requirements.points).toEqual([
      { attemptNumber: 1, score: 1 },
      { attemptNumber: 2, score: 3 },
    ]);
    expect(requirements.steps).toEqual([
      { fromAttemptNumber: 1, toAttemptNumber: 2, from: 1, to: 3, change: 2 },
    ]);
    expect(requirements.delta).toBe(2);
    expect(requirements.direction).toBe('IMPROVED');
  });

  it('reports a negative delta when a criterion score dropped', async () => {
    const history = await historyWorld();

    const coupling = history.movements.find((m) => m.criterionKey === 'coupling_and_cohesion')!;

    expect(coupling.steps).toEqual([
      { fromAttemptNumber: 1, toAttemptNumber: 2, from: 3, to: 1, change: -2 },
    ]);
    expect(coupling.delta).toBe(-2);
    expect(coupling.direction).toBe('REGRESSED');
  });

  it('leaves an unscored criterion as a gap in the line, never as a zero', async () => {
    const history = await historyWorld();

    const extensibility = history.movements.find((m) => m.criterionKey === 'extensibility')!;

    // Attempt 2 did not score it. One point, so no delta can be drawn.
    expect(extensibility.points).toEqual([{ attemptNumber: 1, score: 1 }]);
    expect(extensibility.delta).toBeNull();
    expect(extensibility.direction).toBe('UNKNOWN');
    expect(history.attempts[1]!.scoresByCriterion).not.toHaveProperty('extensibility');
  });

  it('flags a criterion scored at or below 1 in two of the last three attempts as recurring', async () => {
    const history = await historyWorld();

    const responsibilities = history.movements.find(
      (m) => m.criterionKey === 'responsibilities_and_decomposition',
    )!;
    const requirements = history.movements.find(
      (m) => m.criterionKey === 'requirements_and_assumptions',
    )!;

    // 1 then 2 — only one hit at or below 1, so not yet recurring.
    expect(responsibilities.isRecurringWeakness).toBe(false);
    // 1 then 3 — improved out of it.
    expect(requirements.isRecurringWeakness).toBe(false);
  });
});
