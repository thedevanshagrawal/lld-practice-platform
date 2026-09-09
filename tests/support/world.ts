import type { Evaluator } from '@/domain/ports/Evaluator';
import type { Id } from '@/domain/ids';

import { EvaluationPipeline } from '@/domain/evaluation/EvaluationPipeline';
import { GetAttempt } from '@/application/GetAttempt';
import { DeterministicEvaluator } from '@/infrastructure/evaluators/DeterministicEvaluator';
import { GetHistory } from '@/application/GetHistory';
import { RunEvaluation } from '@/application/RunEvaluation';
import { StartAttempt } from '@/application/StartAttempt';
import { SubmitAttempt } from '@/application/SubmitAttempt';
import type { EvaluationScheduler } from '@/application/SubmitAttempt';
import { InMemoryAttemptRepository } from '@/infrastructure/memory/InMemoryAttemptRepository';
import { InMemoryEvaluationRepository } from '@/infrastructure/memory/InMemoryEvaluationRepository';
import { InMemoryProblemRepository } from '@/infrastructure/memory/InMemoryProblemRepository';
import { InMemoryRubricRepository } from '@/infrastructure/memory/InMemoryRubricRepository';
import { ScriptedIdGenerator } from '@/infrastructure/memory/ids';
import { fixedNow } from '@/infrastructure/memory/clock';
import { PARKING_LOT } from '@/seed/problems';
import { MVP_RUBRIC } from '@/seed/rubric';

export const LEARNER_ID = 'learner-1';
export const PROBLEM_ID = PARKING_LOT.id;
export const SUBMITTED_AT = '2026-09-10T10:00:00.000Z';
export const EVALUATED_AT = '2026-09-10T10:00:30.000Z';

export interface World {
  readonly attempts: InMemoryAttemptRepository;
  readonly evaluations: InMemoryEvaluationRepository;
  readonly problems: InMemoryProblemRepository;
  readonly rubrics: InMemoryRubricRepository;
  readonly start: StartAttempt;
  readonly submit: SubmitAttempt;
  readonly run: RunEvaluation;
  readonly getAttempt: GetAttempt;
  readonly getHistory: GetHistory;
}

/**
 * One wiring for every application test: real use cases, in-memory adapters, a frozen
 * clock and scripted ids, so every assertion can name an exact value instead of
 * `expect.any(String)`.
 *
 * Nothing here touches Mongo, Next or the Gemini SDK. Evaluators are injected, which is
 * the point: the suite proves the ports are real by exercising them with fakes.
 */
export function makeWorld(options: {
  evaluators?: readonly Evaluator[];
  attemptIds?: readonly Id[];
  submissionIds?: readonly Id[];
  evaluationIds?: readonly Id[];
  /** Wired into SubmitAttempt. Omit it and an attempt simply waits in SUBMITTED. */
  scheduleEvaluation?: (world: World) => EvaluationScheduler;
} = {}): World {
  const attempts = new InMemoryAttemptRepository();
  const evaluations = new InMemoryEvaluationRepository();
  const problems = new InMemoryProblemRepository([PARKING_LOT]);
  const rubrics = new InMemoryRubricRepository([MVP_RUBRIC]);

  const pipeline = new EvaluationPipeline(options.evaluators ?? []);

  const start = new StartAttempt({
    attempts,
    problems,
    ids: new ScriptedIdGenerator(options.attemptIds ?? ['att-1', 'att-2', 'att-3', 'att-4']),
    now: fixedNow(SUBMITTED_AT),
  });

  const run = new RunEvaluation({
    attempts,
    evaluations,
    problems,
    rubrics,
    pipeline,
    ids: new ScriptedIdGenerator(options.evaluationIds ?? ['eval-1', 'eval-2', 'eval-3', 'eval-4']),
    now: fixedNow(EVALUATED_AT),
  });

  const world: Partial<World> = {
    attempts,
    evaluations,
    problems,
    rubrics,
    start,
    run,
    getAttempt: new GetAttempt({
      attempts,
      evaluations,
      problems,
      rubrics,
      // Mirrors the composition root. Without it the read path silently returns no
      // findings and the outage tests would pass while proving nothing.
      structural: new DeterministicEvaluator(),
    }),
    getHistory: new GetHistory({ attempts, evaluations, problems, rubrics }),
  };

  // `World.submit` is readonly, so the late back-reference (the scheduler needs the
  // world, the world needs the scheduler) is written through a mutable view. Behaviour
  // is unchanged; this only unblocks `tsc --noEmit`.
  (world as { submit?: SubmitAttempt }).submit = new SubmitAttempt({
    attempts,
    ids: new ScriptedIdGenerator(options.submissionIds ?? ['sub-1', 'sub-2', 'sub-3', 'sub-4']),
    now: fixedNow(SUBMITTED_AT),
    scheduleEvaluation: options.scheduleEvaluation?.(world as World),
  });

  return world as World;
}
