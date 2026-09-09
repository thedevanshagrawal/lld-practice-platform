/**
 * Structural findings — the deterministic evaluator's output vocabulary.
 *
 * A finding is a MEASURED FACT about a submission. It is deliberately NOT a score:
 * a method count is not a design judgement and must never be dressed as one
 * (RUBRIC_AND_EVALUATION.md §7.2.1).
 *
 * This file imports nothing outside itself. It is infrastructure only because the
 * checks that produce findings are adapter concerns, not domain invariants.
 */

/**
 * blocker — the submission cannot be evaluated at all. Short-circuits the LLM call.
 * warning — a real signal the learner and the LLM should both see. Never a score.
 * info    — the check ran and passed. Present so "we looked" is visible, not implied.
 */
export type FindingSeverity = 'blocker' | 'warning' | 'info';

/** Stable ids, matching the D-numbers in RUBRIC_AND_EVALUATION.md §3. */
export type StructuralCheckId = 'D1' | 'D2' | 'D3' | 'D4';

export interface StructuralFinding {
  readonly checkId: StructuralCheckId;
  readonly severity: FindingSeverity;
  /** Learner-facing, one sentence, states the measurement not an opinion. */
  readonly message: string;
  /** Where in the submission the measurement was taken, e.g. 'Classes > ParkingLot'. */
  readonly location: string;
}

export interface DeterministicConfig {
  /**
   * Absolute god-object threshold: a class listing this many methods or more is flagged.
   *
   * ARGUED, NOT MEASURED. See RUBRIC_AND_EVALUATION.md §3.1 — no corpus of scored
   * submissions exists yet, so this is a default to be replaced with a measured value,
   * not a number derived from counting anything.
   */
  readonly godObjectMethodThreshold: number;
  /**
   * Relative god-object threshold, 0..1. Catches the small-submission case the absolute
   * rule misses: 5 of 9 methods on one class in a 3-class design is centralised even
   * though nothing crosses 7.
   */
  readonly godObjectShareThreshold: number;
  /** Below this, there is no decomposition to judge. Blocker, not a warning. */
  readonly minimumClassCount: number;
  /** Sections that must be present for the submission to be evaluable at all. */
  readonly requiredSections: readonly ('ASSUMPTIONS' | 'CLASSES' | 'RELATIONSHIPS' | 'TRADE_OFFS')[];
}

export const DEFAULT_DETERMINISTIC_CONFIG: DeterministicConfig = {
  godObjectMethodThreshold: 7,
  godObjectShareThreshold: 0.4,
  minimumClassCount: 3,
  requiredSections: ['ASSUMPTIONS', 'CLASSES', 'RELATIONSHIPS', 'TRADE_OFFS'],
};

export interface DeterministicReport {
  readonly findings: readonly StructuralFinding[];
  /** True when at least one finding is a blocker. The LLM call is then skipped. */
  readonly blocking: boolean;
  /**
   * Class names flagged by D4. The single documented deterministic-over-LLM override
   * (§7.2.5) caps `responsibilities_and_decomposition` at 3 when this is non-empty.
   */
  readonly godObjectClassNames: readonly string[];
}

export function hasBlocker(findings: readonly StructuralFinding[]): boolean {
  return findings.some((f) => f.severity === 'blocker');
}
