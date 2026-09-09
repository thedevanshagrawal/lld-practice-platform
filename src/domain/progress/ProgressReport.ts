import type { AttemptId, CriterionKey, LearnerId, ProblemId } from '../ids';
import type { Attempt } from '../attempt/Attempt';
import type { AttemptStatus } from '../attempt/AttemptStatus';
import type { Evaluation } from '../evaluation/Evaluation';
import type { OverallScore } from '../rubric/scoring';
import type { Rubric } from '../rubric/Rubric';
import type { Score } from '../rubric/Criterion';

export const RECURRING_WEAKNESS_MAX_SCORE: Score = 1;
export const RECURRING_WEAKNESS_WINDOW = 3;
export const RECURRING_WEAKNESS_MIN_HITS = 2;

export interface AttemptScoreSummary {
  readonly attemptId: AttemptId;
  readonly attemptNumber: number;
  readonly status: AttemptStatus;
  readonly submittedAt: Date | null;
  readonly overall: OverallScore | null;
  readonly scoresByCriterion: Readonly<Record<CriterionKey, Score>>;
}

export interface CriterionTrend {
  readonly criterionKey: CriterionKey;
  readonly label: string;
  readonly points: readonly { attemptNumber: number; score: Score }[];
  /** latest minus first; null when fewer than two comparable points exist. */
  readonly delta: number | null;
  readonly isRecurringWeakness: boolean;
}

export interface ProgressReport {
  readonly learnerId: LearnerId;
  readonly problemId: ProblemId;
  /** Trends cover only attempts scored under this rubric version. */
  readonly rubricVersion: number;
  readonly attempts: readonly AttemptScoreSummary[];
  readonly trends: readonly CriterionTrend[];
  /** Attempts excluded because they were scored under a different rubric version. */
  readonly excludedAttemptIds: readonly AttemptId[];
}

/**
 * Turns a learner's attempts at one problem into per-criterion movement.
 *
 * Pure arithmetic over domain objects, no I/O. Two rules it will not bend:
 *  - a trend is never drawn across a rubric version boundary; attempts scored under
 *    a different ruler are listed in `excludedAttemptIds` instead of quietly averaged in;
 *  - a criterion with no score is a gap in the line, never a zero.
 */
export function buildProgressReport(args: {
  learnerId: LearnerId;
  problemId: ProblemId;
  rubric: Rubric;
  attempts: readonly Attempt[];
  /** The latest run per attempt. */
  evaluations: readonly Evaluation[];
}): ProgressReport {
  const { learnerId, problemId, rubric, attempts, evaluations } = args;

  const latestByAttempt = new Map<AttemptId, Evaluation>();
  for (const evaluation of evaluations) {
    const held = latestByAttempt.get(evaluation.attemptId);
    if (!held || evaluation.runNumber >= held.runNumber) {
      latestByAttempt.set(evaluation.attemptId, evaluation);
    }
  }

  const ordered = [...attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);

  const summaries: AttemptScoreSummary[] = [];
  const excludedAttemptIds: AttemptId[] = [];
  /** attemptNumber -> comparable scores, for attempts on the current rubric version. */
  const comparable: {
    attemptNumber: number;
    status: AttemptStatus;
    scores: Record<CriterionKey, Score>;
  }[] = [];

  for (const attempt of ordered) {
    const evaluation = latestByAttempt.get(attempt.id) ?? null;
    const onCurrentRuler = evaluation !== null && evaluation.rubricVersion === rubric.version;

    if (evaluation !== null && !onCurrentRuler) {
      excludedAttemptIds.push(attempt.id);
    }

    const scoresByCriterion: Record<CriterionKey, Score> = {};
    if (evaluation !== null) {
      for (const result of evaluation.results) {
        if (result.score !== null) {
          scoresByCriterion[result.criterionKey] = result.score;
        }
      }
    }

    summaries.push({
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      submittedAt: attempt.submission?.submittedAt ?? null,
      overall: evaluation?.overall ?? null,
      scoresByCriterion,
    });

    if (onCurrentRuler) {
      comparable.push({
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        scores: scoresByCriterion,
      });
    }
  }

  const trends: CriterionTrend[] = rubric.criteria.map((criterion) => {
    const points = comparable
      .filter((entry) => entry.scores[criterion.key] !== undefined)
      .map((entry) => ({
        attemptNumber: entry.attemptNumber,
        score: entry.scores[criterion.key] as Score,
      }));

    const delta =
      points.length >= 2 ? points[points.length - 1]!.score - points[0]!.score : null;

    return {
      criterionKey: criterion.key,
      label: criterion.label,
      points,
      delta,
      isRecurringWeakness: isRecurringWeakness(comparable, criterion.key),
    };
  });

  return {
    learnerId,
    problemId,
    rubricVersion: rubric.version,
    attempts: summaries,
    trends,
    excludedAttemptIds,
  };
}

/** Score <= 1 in at least two of the last three completed attempts. */
function isRecurringWeakness(
  comparable: readonly {
    attemptNumber: number;
    status: AttemptStatus;
    scores: Record<CriterionKey, Score>;
  }[],
  key: CriterionKey,
): boolean {
  const window = comparable
    .filter((entry) => entry.status === 'COMPLETED')
    .slice(-RECURRING_WEAKNESS_WINDOW);

  const hits = window.filter((entry) => {
    const score = entry.scores[key];
    return score !== undefined && score <= RECURRING_WEAKNESS_MAX_SCORE;
  }).length;

  return hits >= RECURRING_WEAKNESS_MIN_HITS;
}
