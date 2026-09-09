import type { CriterionResult } from '../evaluation/CriterionResult';
import type { Rubric } from './Rubric';
import { criterionByKey } from './Rubric';
import { UnknownCriterionError } from '../errors';

/**
 * Fewer scored criteria than this and NO overall is reported at all
 * (RUBRIC_AND_EVALUATION.md §7.1). Averaging one or two dimensions and calling the
 * result a design score is exactly the false precision this platform exists to avoid.
 */
export const MIN_SCORED_CRITERIA_FOR_OVERALL = 3;

export interface OverallScore {
  /**
   * Weighted mean over assessed criteria only, on the 0..4 scale.
   * `null` when nothing was assessed (assessedWeight === 0), and also when fewer than
   * MIN_SCORED_CRITERIA_FOR_OVERALL criteria were scored. It is deliberately NOT 0:
   * "we could not score this" and "the learner scored zero" are different facts, and
   * collapsing them makes a degraded run look like a failure.
   */
  readonly weighted: number | null;
  /** Sum of the weights actually assessed. 1 for a COMPLETE run, < 1 for PARTIAL. */
  readonly assessedWeight: number;
}

/**
 * Renormalises over assessed criteria, so a PARTIAL run reports an honest score
 * rather than one silently dragged down by dimensions nobody scored.
 *
 * Below MIN_SCORED_CRITERIA_FOR_OVERALL scored criteria there is no overall at all.
 * `assessedWeight` stays honest either way: it always reports the weight actually
 * assessed, so the UI can still say how much of the rubric was covered.
 *
 * Throws UnknownCriterionError if a result names a criterion absent from the rubric.
 */
export function computeOverallScore(
  rubric: Rubric,
  results: readonly CriterionResult[],
): OverallScore {
  let numerator = 0;
  let assessedWeight = 0;
  let scoredCount = 0;

  for (const result of results) {
    const criterion = criterionByKey(rubric, result.criterionKey);
    if (!criterion) {
      throw new UnknownCriterionError(result.criterionKey, rubric.id);
    }

    if (result.score !== null) {
      numerator += result.score * criterion.weight;
      assessedWeight += criterion.weight;
      scoredCount += 1;
    }
  }

  const weighted =
    scoredCount >= MIN_SCORED_CRITERIA_FOR_OVERALL && assessedWeight > 0
      ? Math.round((numerator / assessedWeight) * 10) / 10
      : null;

  return { weighted, assessedWeight };
}
