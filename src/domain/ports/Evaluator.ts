import type { CriterionKey, EvaluatorTag } from '../ids';
import type { Problem } from '../Problem';
import type { Rubric } from '../rubric/Rubric';
import type { SubmissionContent } from '../content/SubmissionContent';
import type { CriterionResult } from '../evaluation/CriterionResult';

/**
 * What an evaluator is handed. Note what is absent: no Attempt, no learner id, no
 * repository, no clock. An evaluator reads a submission and scores criteria; it has
 * no business knowing whose attempt it is or how many they have made.
 */
export interface EvaluationRequest {
  readonly problem: Problem;
  readonly rubric: Rubric;
  /** Exactly the criteria this evaluator is expected to score. Nothing more. */
  readonly criterionKeys: readonly CriterionKey[];
  /** The seam from Change Test A. No evaluator ever sees a concrete content class. */
  readonly content: SubmissionContent;
}

export interface EvaluatorOutput {
  readonly tag: EvaluatorTag;
  readonly adapter: string;
  readonly results: readonly CriterionResult[];
}

export interface Evaluator {
  /** Capability, not vendor. Matched against Criterion.assessedBy. */
  readonly tag: EvaluatorTag;
  /** Concrete implementation identity, recorded on the Evaluation for audit. */
  readonly adapter: string;

  /**
   * Must return one result per requested criterion key, or reject.
   *
   * Contract details the pipeline enforces on the way back:
   *  - results whose criterionKey was NOT requested are discarded;
   *  - a requested key with no result is recorded as an EvaluatorFailure, and the
   *    results that WERE returned are kept (a dropped criterion degrades the run to
   *    PARTIAL, it never discards the rest);
   *  - a rejection is recorded as an EvaluatorFailure and never discards the
   *    results of other evaluators.
   *
   * Timeouts, retries, backoff and JSON repair belong to the adapter, not to this
   * contract. The domain has no business knowing about milliseconds.
   */
  evaluate(request: EvaluationRequest): Promise<EvaluatorOutput>;
}
