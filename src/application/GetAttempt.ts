import type { AttemptId, EvaluationId, LearnerId, ProblemId } from '../domain/ids';
import type { AttemptStatus } from '../domain/attempt/AttemptStatus';
import type { SubmissionContent } from '../domain/content/SubmissionContent';
import type { Evaluation } from '../domain/evaluation/Evaluation';
import type { Problem } from '../domain/Problem';
import type { Rubric } from '../domain/rubric/Rubric';
import type { AttemptRepository } from '../domain/ports/AttemptRepository';
import type { EvaluationRepository } from '../domain/ports/EvaluationRepository';
import type { ProblemRepository } from '../domain/ports/ProblemRepository';
import type { RubricRepository } from '../domain/ports/RubricRepository';
import type { StructuralAnalyzer, StructuralFindingView } from '../domain/ports/StructuralAnalyzer';
import { AttemptNotFoundError, ProblemNotFoundError, RubricNotFoundError } from './errors';

export interface GetAttemptDeps {
  readonly attempts: AttemptRepository;
  readonly evaluations: EvaluationRepository;
  readonly problems: ProblemRepository;
  readonly rubrics: RubricRepository;
  /**
   * Optional. When present, structural findings are recomputed on every read so the
   * learner still gets feedback when the LLM produced none.
   */
  readonly structural?: StructuralAnalyzer;
}

export interface GetAttemptInput {
  readonly attemptId: AttemptId;
}

export interface GetAttemptResult {
  readonly attemptId: AttemptId;
  readonly learnerId: LearnerId;
  readonly problemId: ProblemId;
  readonly attemptNumber: number;
  readonly status: AttemptStatus;
  readonly createdAt: Date;
  readonly submittedAt: Date | null;
  readonly failureReason: string | null;
  /** Never a concrete content class — the format seam holds all the way to the UI. */
  readonly content: SubmissionContent | null;
  readonly latestEvaluationId: EvaluationId | null;
  /** The latest run. Present on a FAILED attempt too, carrying partial results. */
  readonly evaluation: Evaluation | null;
  readonly problem: Problem;
  /**
   * The rubric the evaluation was scored under, not necessarily the current one —
   * labels and anchors must match the ruler that produced the scores on screen.
   */
  readonly rubric: Rubric;
  /** True when evaluation may still be in flight; the UI polls on this. */
  readonly isEvaluating: boolean;
  /** True when the learner can ask for a re-run without re-submitting. */
  readonly canRetryEvaluation: boolean;
  /**
   * Deterministic, measured facts about the submission. Recomputed on read.
   *
   * This is what makes an LLM outage survivable from the learner's side. Every seeded
   * criterion is scored by the model, so when the model is down the stored Evaluation
   * carries no results at all. Without this field a FAILED attempt would show the
   * learner nothing but an error, and the claim that a failed evaluation still returns
   * something useful would be false. These are facts, never scores.
   */
  readonly structuralFindings: readonly StructuralFindingView[];
}

/**
 * The polling read. It deliberately returns the evaluation even when the attempt is
 * FAILED: FAILED means "our verdict is incomplete", not "your work is gone", and the
 * partial results are the difference between a retry affordance and an error page.
 */
export class GetAttempt {
  private readonly deps: GetAttemptDeps;

  constructor(deps: GetAttemptDeps) {
    this.deps = deps;
  }

  /**
   * Never throws. A broken structural check must not take down the read path that
   * exists precisely to survive a broken evaluator.
   */
  private analyse(content: SubmissionContent | null): readonly StructuralFindingView[] {
    const { structural } = this.deps;
    if (!structural || !content) {
      return [];
    }
    try {
      return structural.run(content).findings;
    } catch {
      return [];
    }
  }

  async execute(input: GetAttemptInput): Promise<GetAttemptResult> {
    const { attempts, evaluations, problems, rubrics } = this.deps;

    const attempt = await attempts.findById(input.attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(input.attemptId);
    }

    const problem = await problems.findById(attempt.problemId);
    if (!problem) {
      throw new ProblemNotFoundError(attempt.problemId);
    }

    const evaluation = await evaluations.findLatestByAttemptId(attempt.id);

    // Pin the rubric version the evaluation was scored under; fall back to current
    // when nothing has been scored yet.
    const rubric = await rubrics.findById(problem.rubricId, evaluation?.rubricVersion);
    if (!rubric) {
      throw new RubricNotFoundError(problem.rubricId, evaluation?.rubricVersion);
    }

    return {
      attemptId: attempt.id,
      learnerId: attempt.learnerId,
      problemId: attempt.problemId,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      createdAt: attempt.createdAt,
      submittedAt: attempt.submission?.submittedAt ?? null,
      failureReason: attempt.failureReason,
      content: attempt.submission?.content ?? null,
      latestEvaluationId: attempt.latestEvaluationId,
      evaluation,
      problem,
      rubric,
      isEvaluating: attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATING',
      canRetryEvaluation: attempt.canTransitionTo('EVALUATING'),
      structuralFindings: this.analyse(attempt.submission?.content ?? null),
    };
  }
}
