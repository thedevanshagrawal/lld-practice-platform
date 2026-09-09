import type { AttemptId, CriterionKey, EvaluationId, EvaluatorTag, RubricId } from '../ids';
import type { CriterionResult } from './CriterionResult';
import type { OverallScore } from '../rubric/scoring';
import type { Rubric } from '../rubric/Rubric';
import type { EvaluatorOutput } from '../ports/Evaluator';
import { computeOverallScore } from '../rubric/scoring';
import { criterionByKey } from '../rubric/Rubric';
import { DuplicateCriterionResultError, UnknownCriterionError } from '../errors';

/**
 * COMPLETE: all criteria scored.
 * PARTIAL: some evaluator failed, results kept.
 * NOT_EVALUABLE: deterministic blocker (missing sections or <3 classes), no LLM call made.
 */
export type EvaluationOutcome = 'COMPLETE' | 'PARTIAL' | 'NOT_EVALUABLE';

export interface EvaluatorContribution {
  readonly tag: EvaluatorTag;
  /** Concrete adapter identity, for audit: 'gemini-2.0-flash', 'rules-v3', 'human'. */
  readonly adapter: string;
  readonly criterionKeys: readonly CriterionKey[];
}

export interface EvaluatorFailure {
  readonly tag: EvaluatorTag;
  readonly adapter: string;
  readonly reason: string;
}

export interface Evaluation {
  readonly id: EvaluationId;
  readonly attemptId: AttemptId;
  readonly rubricId: RubricId;
  /** Trends are never drawn across a version boundary. */
  readonly rubricVersion: number;
  /** 1-based. A re-run appends a new Evaluation; it never overwrites the old one. */
  readonly runNumber: number;
  readonly results: readonly CriterionResult[];
  readonly overall: OverallScore;
  readonly outcome: EvaluationOutcome;
  readonly contributions: readonly EvaluatorContribution[];
  readonly failures: readonly EvaluatorFailure[];
  readonly createdAt: Date;
}

/**
 * Pure assembly. Validates every result against the rubric, rejects a criterion
 * scored twice, computes the overall score, derives the outcome from failures.
 * Throws UnknownCriterionError / DuplicateCriterionResultError.
 */
export function assembleEvaluation(args: {
  id: EvaluationId;
  attemptId: AttemptId;
  rubric: Rubric;
  runNumber: number;
  outputs: readonly EvaluatorOutput[];
  failures: readonly EvaluatorFailure[];
  createdAt: Date;
}): Evaluation {
  const { id, attemptId, rubric, runNumber, outputs, failures, createdAt } = args;

  // Collect all results and check for duplicates + unknown criteria
  const allResults: CriterionResult[] = [];
  const seenKeys = new Map<CriterionKey, EvaluatorTag>();
  const contributions: EvaluatorContribution[] = [];

  for (const output of outputs) {
    const keys: CriterionKey[] = [];
    for (const result of output.results) {
      // Check unknown criterion
      if (!criterionByKey(rubric, result.criterionKey)) {
        throw new UnknownCriterionError(result.criterionKey, rubric.id);
      }
      // Check duplicate
      const existingTag = seenKeys.get(result.criterionKey);
      if (existingTag) {
        throw new DuplicateCriterionResultError(result.criterionKey, [existingTag, output.tag]);
      }
      seenKeys.set(result.criterionKey, output.tag);
      keys.push(result.criterionKey);
      allResults.push(result);
    }
    if (keys.length > 0) {
      contributions.push({ tag: output.tag, adapter: output.adapter, criterionKeys: keys });
    }
  }

  // Compute overall
  const overall = computeOverallScore(rubric, allResults);

  // Derive outcome. An evaluator FAILURE degrades a run to PARTIAL and never to
  // NOT_EVALUABLE: the two say different things to the learner. NOT_EVALUABLE means
  // the submission itself could not be assessed (a deterministic blocker, no LLM call
  // made); PARTIAL means we tried and our verdict is incomplete. Reporting a Gemini
  // timeout on a perfectly good design as NOT_EVALUABLE tells the learner their work
  // was not assessable when in fact the model was down.
  const outcome: EvaluationOutcome = failures.length > 0 ? 'PARTIAL' : 'COMPLETE';

  return {
    id,
    attemptId,
    rubricId: rubric.id,
    rubricVersion: rubric.version,
    runNumber,
    results: allResults,
    overall,
    outcome,
    contributions,
    failures,
    createdAt,
  };
}

export function isPartial(evaluation: Evaluation): boolean {
  return evaluation.outcome === 'PARTIAL' || evaluation.outcome === 'NOT_EVALUABLE';
}
