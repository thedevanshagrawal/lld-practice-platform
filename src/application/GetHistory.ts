import type { AttemptId, CriterionKey, LearnerId, ProblemId } from '../domain/ids';
import type { Score } from '../domain/rubric/Criterion';
import type { Rubric } from '../domain/rubric/Rubric';
import type { Problem } from '../domain/Problem';
import type { AttemptScoreSummary } from '../domain/progress/ProgressReport';
import type { AttemptRepository } from '../domain/ports/AttemptRepository';
import type { EvaluationRepository } from '../domain/ports/EvaluationRepository';
import type { ProblemRepository } from '../domain/ports/ProblemRepository';
import type { RubricRepository } from '../domain/ports/RubricRepository';
import { buildProgressReport } from '../domain/progress/ProgressReport';
import { ProblemNotFoundError, RubricNotFoundError } from './errors';

export interface GetHistoryDeps {
  readonly attempts: AttemptRepository;
  readonly evaluations: EvaluationRepository;
  readonly problems: ProblemRepository;
  readonly rubrics: RubricRepository;
}

export interface GetHistoryInput {
  readonly learnerId: LearnerId;
  readonly problemId: ProblemId;
}

/** One step between two consecutive comparable attempts, for one criterion. */
export interface CriterionStep {
  readonly fromAttemptNumber: number;
  readonly toAttemptNumber: number;
  readonly from: Score;
  readonly to: Score;
  /** to - from. Negative means the learner regressed on this dimension. */
  readonly change: number;
}

export interface CriterionMovement {
  readonly criterionKey: CriterionKey;
  readonly label: string;
  /** Only attempts scored under the same rubric version. A gap is a gap, never a 0. */
  readonly points: readonly { attemptNumber: number; score: Score }[];
  readonly steps: readonly CriterionStep[];
  /** latest minus first; null when fewer than two comparable points exist. */
  readonly delta: number | null;
  readonly direction: 'IMPROVED' | 'REGRESSED' | 'FLAT' | 'UNKNOWN';
  /** Score <= 1 in at least two of the last three completed attempts. */
  readonly isRecurringWeakness: boolean;
}

export interface GetHistoryResult {
  readonly learnerId: LearnerId;
  readonly problemId: ProblemId;
  readonly problem: Problem;
  readonly rubric: Rubric;
  readonly rubricVersion: number;
  /** Ascending by attemptNumber. The order is asserted, not incidental. */
  readonly attempts: readonly AttemptScoreSummary[];
  /** In rubric order, one entry per criterion — this is the product requirement. */
  readonly movements: readonly CriterionMovement[];
  /** Scored under a different rubric version, therefore not comparable. */
  readonly excludedAttemptIds: readonly AttemptId[];
}

/**
 * The history view. The claim this product makes is improvement, not one-time
 * solving, so a list of past overall scores is not enough: the value is seeing
 * WHICH dimension is stuck. That is why `movements` is per criterion and carries
 * consecutive steps, not just a first-to-last delta.
 */
export class GetHistory {
  private readonly deps: GetHistoryDeps;

  constructor(deps: GetHistoryDeps) {
    this.deps = deps;
  }

  async execute(input: GetHistoryInput): Promise<GetHistoryResult> {
    const { attempts, evaluations, problems, rubrics } = this.deps;

    const problem = await problems.findById(input.problemId);
    if (!problem) {
      throw new ProblemNotFoundError(input.problemId);
    }

    const rubric = await rubrics.findById(problem.rubricId);
    if (!rubric) {
      throw new RubricNotFoundError(problem.rubricId);
    }

    const learnerAttempts = await attempts.listByLearnerAndProblem(
      input.learnerId,
      problem.id,
    );
    const latestRuns = await evaluations.latestForAttempts(
      learnerAttempts.map((attempt) => attempt.id),
    );

    const report = buildProgressReport({
      learnerId: input.learnerId,
      problemId: problem.id,
      rubric,
      attempts: learnerAttempts,
      evaluations: latestRuns,
    });

    const movements: CriterionMovement[] = report.trends.map((trend) => {
      const steps: CriterionStep[] = [];
      for (let i = 1; i < trend.points.length; i += 1) {
        const previous = trend.points[i - 1]!;
        const current = trend.points[i]!;
        steps.push({
          fromAttemptNumber: previous.attemptNumber,
          toAttemptNumber: current.attemptNumber,
          from: previous.score,
          to: current.score,
          change: current.score - previous.score,
        });
      }

      return {
        criterionKey: trend.criterionKey,
        label: trend.label,
        points: trend.points,
        steps,
        delta: trend.delta,
        direction: directionOf(trend.delta),
        isRecurringWeakness: trend.isRecurringWeakness,
      };
    });

    return {
      learnerId: report.learnerId,
      problemId: report.problemId,
      problem,
      rubric,
      rubricVersion: report.rubricVersion,
      attempts: report.attempts,
      movements,
      excludedAttemptIds: report.excludedAttemptIds,
    };
  }
}

function directionOf(delta: number | null): CriterionMovement['direction'] {
  if (delta === null) return 'UNKNOWN';
  if (delta > 0) return 'IMPROVED';
  if (delta < 0) return 'REGRESSED';
  return 'FLAT';
}
