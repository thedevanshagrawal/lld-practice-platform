import type { CriterionKey } from '../ids';
import type { Confidence, Score } from '../rubric/Criterion';
import { isConfidence, isScore, SCORE_MAX } from '../rubric/Criterion';
import { InvalidCriterionResultError } from '../errors';

/** Shape is fixed. Nothing is added to it; everything else adapts to it. */
export interface CriterionResult {
  readonly criterionKey: CriterionKey;
  readonly score: Score | null;
  /** MANDATORY, non-empty. A quotation of, or precise reference to, the learner's words. */
  readonly evidence: string;
  /** What is weak or missing. May be empty only at SCORE_MAX. */
  readonly concern: string;
  /** One actionable next step. MANDATORY, non-empty. */
  readonly suggestion: string;
  readonly confidence: Confidence;
}

/**
 * The only supported way to build one. Enforces:
 *   score      integer in [SCORE_MIN, SCORE_MAX] or null
 *   evidence   non-empty after trimming
 *   suggestion non-empty after trimming
 *   concern    non-empty unless score === SCORE_MAX
 *   confidence in [0, 1]
 * Throws InvalidCriterionResultError. A malformed LLM response dies here, not in the UI.
 */
export function createCriterionResult(input: {
  criterionKey: CriterionKey;
  score: number | null;
  evidence: string;
  concern: string;
  suggestion: string;
  confidence: number;
}): CriterionResult {
  const { criterionKey, score, evidence, concern, suggestion, confidence } = input;

  // Validate score
  if (score !== null && !isScore(score)) {
    throw new InvalidCriterionResultError(
      criterionKey,
      'score',
      `must be an integer between 0 and 4, got ${score}`,
    );
  }

  // Validate evidence
  if (!evidence || evidence.trim().length === 0) {
    throw new InvalidCriterionResultError(
      criterionKey,
      'evidence',
      'must be non-empty',
    );
  }

  // Validate suggestion
  if (!suggestion || suggestion.trim().length === 0) {
    throw new InvalidCriterionResultError(
      criterionKey,
      'suggestion',
      'must be non-empty',
    );
  }

  // Validate concern (may be empty only at SCORE_MAX)
  if (score !== null && score !== SCORE_MAX && (!concern || concern.trim().length === 0)) {
    throw new InvalidCriterionResultError(
      criterionKey,
      'concern',
      `must be non-empty when score is not ${SCORE_MAX}`,
    );
  }

  // Validate confidence
  if (!isConfidence(confidence)) {
    throw new InvalidCriterionResultError(
      criterionKey,
      'confidence',
      `must be between 0 and 1, got ${confidence}`,
    );
  }

  return {
    criterionKey,
    score: score as Score | null,
    evidence: evidence.trim(),
    concern: concern?.trim() ?? '',
    suggestion: suggestion.trim(),
    confidence,
  };
}
