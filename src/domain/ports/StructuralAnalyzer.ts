import type { SubmissionContent } from '../content/SubmissionContent';

/**
 * A measured fact about a submission. Never a score.
 *
 * Declared in the domain rather than imported from an adapter because the READ path
 * depends on it: when the LLM is unavailable, these findings are the only feedback
 * the learner gets, so they are part of what the product promises, not an adapter
 * implementation detail. The concrete DeterministicEvaluator satisfies this
 * structurally, so nothing under src/application ever names an adapter.
 */
export interface StructuralFindingView {
  readonly checkId: string;
  readonly severity: 'blocker' | 'warning' | 'info';
  readonly message: string;
  readonly location: string;
}

export interface StructuralReportView {
  readonly findings: readonly StructuralFindingView[];
}

/**
 * Recomputed on read rather than stored.
 *
 * The checks are pure and cheap, so deriving them from the persisted submission is
 * cheaper than keeping a copy in sync, and it means a submission written before a
 * check existed still gets that check applied when it is next viewed.
 */
export interface StructuralAnalyzer {
  run(content: SubmissionContent): StructuralReportView;
}
