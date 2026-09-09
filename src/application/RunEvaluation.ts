import type { AttemptId, EvaluationId } from '../domain/ids';
import type { AttemptStatus } from '../domain/attempt/AttemptStatus';
import type { EvaluationOutcome, EvaluatorFailure } from '../domain/evaluation/Evaluation';
import type { EvaluationPipeline, PipelineRunResult } from '../domain/evaluation/EvaluationPipeline';
import type { AttemptRepository } from '../domain/ports/AttemptRepository';
import type { EvaluationRepository } from '../domain/ports/EvaluationRepository';
import type { ProblemRepository } from '../domain/ports/ProblemRepository';
import type { RubricRepository } from '../domain/ports/RubricRepository';
import type { IdGenerator } from '../domain/ports/IdGenerator';
import type { Now } from '../domain/ports/Clock';
import { assembleEvaluation } from '../domain/evaluation/Evaluation';
import {
  AttemptNotFoundError,
  MissingSubmissionError,
  ProblemNotFoundError,
  RubricNotFoundError,
} from './errors';

export interface RunEvaluationDeps {
  readonly attempts: AttemptRepository;
  readonly evaluations: EvaluationRepository;
  readonly problems: ProblemRepository;
  readonly rubrics: RubricRepository;
  readonly pipeline: EvaluationPipeline;
  readonly ids: IdGenerator;
  readonly now: Now;
}

export interface RunEvaluationInput {
  readonly attemptId: AttemptId;
}

export interface RunEvaluationResult {
  readonly attemptId: AttemptId;
  /** null only when the run could not be assembled at all. */
  readonly evaluationId: EvaluationId | null;
  readonly runNumber: number;
  readonly outcome: EvaluationOutcome;
  readonly status: AttemptStatus;
  readonly failures: readonly EvaluatorFailure[];
}

/**
 * Drives one pipeline run over one stored submission.
 *
 * SUBMITTED | FAILED -> EVALUATING -> COMPLETED | FAILED. The EVALUATING transition
 * is persisted before the pipeline starts, which is what makes it the lock: a second
 * concurrent run throws IllegalAttemptTransitionError instead of burning a second
 * Gemini call and writing a competing verdict.
 *
 * Re-runnable from FAILED with no re-submission, because the submission is immutable
 * and already stored. That is the reliability requirement, and it costs nothing here
 * because it is already a legal transition in the domain's table.
 *
 * On the fire-and-forget path this returns a promise nobody awaits — attach a
 * `.catch()`, or use `createInlineEvaluationScheduler`, which does it for you.
 */
export class RunEvaluation {
  private readonly deps: RunEvaluationDeps;

  constructor(deps: RunEvaluationDeps) {
    this.deps = deps;
  }

  async execute(input: RunEvaluationInput): Promise<RunEvaluationResult> {
    const { attempts, evaluations, problems, rubrics, pipeline, ids, now } = this.deps;

    const attempt = await attempts.findById(input.attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(input.attemptId);
    }

    const submission = attempt.submission;
    if (!submission) {
      // Defensive: reaching here means store-before-evaluate was broken upstream.
      throw new MissingSubmissionError(attempt.id);
    }

    const problem = await problems.findById(attempt.problemId);
    if (!problem) {
      throw new ProblemNotFoundError(attempt.problemId);
    }

    const rubric = await rubrics.findById(problem.rubricId);
    if (!rubric) {
      throw new RubricNotFoundError(problem.rubricId);
    }

    const runNumber = (await evaluations.countRunsForAttempt(attempt.id)) + 1;

    // The lock. Persisted before any evaluator is touched.
    attempt.beginEvaluation();
    await attempts.save(attempt);

    let run: PipelineRunResult;
    try {
      run = await pipeline.run({ problem, rubric, content: submission.content });
    } catch (error) {
      // The pipeline itself broke (misconfigured coverage, or a bug). The learner's
      // work is already safe; record why and leave the attempt re-runnable.
      run = {
        outcome: 'NOT_EVALUABLE',
        outputs: [],
        failures: [{ tag: 'pipeline', adapter: 'EvaluationPipeline', reason: describe(error) }],
      };
    }

    let evaluationId: EvaluationId | null = null;
    let outcome: EvaluationOutcome = run.outcome;
    let failures: readonly EvaluatorFailure[] = run.failures;

    try {
      const evaluation = assembleEvaluation({
        id: ids.next(),
        attemptId: attempt.id,
        rubric,
        runNumber,
        outputs: run.outputs,
        failures: run.failures,
        createdAt: now(),
      });

      // Saved before the attempt is moved out of EVALUATING, so a learner polling
      // a COMPLETED attempt can never find a dangling latestEvaluationId.
      await evaluations.save(evaluation);
      evaluationId = evaluation.id;
      outcome = evaluation.outcome;
      failures = evaluation.failures;
    } catch (error) {
      // Assembly rejected the evaluator output (unknown or duplicated criterion).
      // No Evaluation is written; the attempt still must not be stranded.
      outcome = 'NOT_EVALUABLE';
      failures = [
        ...run.failures,
        { tag: 'assembly', adapter: 'assembleEvaluation', reason: describe(error) },
      ];
    }

    if (outcome === 'COMPLETE') {
      attempt.completeEvaluation(evaluationId as EvaluationId);
    } else {
      // PARTIAL and NOT_EVALUABLE both keep the partial evaluation id, so whatever
      // feedback WAS produced stays visible next to the retry affordance.
      attempt.failEvaluation(reasonFor(outcome, failures), evaluationId);
    }
    await attempts.save(attempt);

    return {
      attemptId: attempt.id,
      evaluationId,
      runNumber,
      outcome,
      status: attempt.status,
      failures,
    };
  }
}

function reasonFor(
  outcome: EvaluationOutcome,
  failures: readonly EvaluatorFailure[],
): string {
  const detail = failures.map((f) => `${f.tag}/${f.adapter}: ${f.reason}`).join('; ');
  return detail.length > 0 ? `${outcome}: ${detail}` : outcome;
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}
