import type { StructuralFacts } from './StructuralFacts';

/**
 * Widened by one literal when a format is added. That widening is what makes the
 * persistence mapper's exhaustive switch fail to compile until it is handled.
 */
export type SubmissionContentKind = 'TEXT_DESIGN';

export interface SubmissionContent {
  readonly kind: SubmissionContentKind;

  /** Stable, deterministic rendering for an LLM evaluator to read. */
  toEvaluationText(): string;

  /** Countable facts for a code evaluator. Never throws; reports absence honestly. */
  structuralFacts(): StructuralFacts;
}
