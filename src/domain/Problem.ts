import type { ProblemId, RubricId } from './ids';

export interface Problem {
  readonly id: ProblemId;
  readonly slug: string;
  readonly title: string;
  /** The scenario the learner designs for. Injected verbatim into the evaluator prompt. */
  readonly statement: string;
  /** Enumerated, so "did the design address requirement 3?" is answerable. */
  readonly requirements: readonly string[];
  readonly constraints: readonly string[];
  readonly rubricId: RubricId;
}
