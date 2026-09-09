/**
 * Application layer barrel.
 *
 * Everything here is framework-free: constructor-injected ports, no HTTP, no
 * database driver, no LLM SDK, no `process.env`. The composition root that wires
 * concrete adapters lives in the infrastructure/app layer, never in here — that is
 * what keeps `src/application` importable from a test with zero setup.
 */

export { ListProblems } from './ListProblems';
export type { ListProblemsDeps } from './ListProblems';

export { GetProblem } from './GetProblem';
export type { GetProblemDeps, GetProblemInput, GetProblemResult } from './GetProblem';

export { StartAttempt } from './StartAttempt';
export type { StartAttemptDeps, StartAttemptInput, StartAttemptResult } from './StartAttempt';

export { SubmitAttempt } from './SubmitAttempt';
export type {
  SubmitAttemptDeps,
  SubmitAttemptInput,
  SubmitAttemptResult,
  EvaluationScheduler,
} from './SubmitAttempt';

export { RunEvaluation } from './RunEvaluation';
export type {
  RunEvaluationDeps,
  RunEvaluationInput,
  RunEvaluationResult,
} from './RunEvaluation';

export { GetAttempt } from './GetAttempt';
export type { GetAttemptDeps, GetAttemptInput, GetAttemptResult } from './GetAttempt';

export { GetHistory } from './GetHistory';
export type {
  GetHistoryDeps,
  GetHistoryInput,
  GetHistoryResult,
  CriterionMovement,
  CriterionStep,
} from './GetHistory';

export { createInlineEvaluationScheduler } from './EvaluationScheduling';

export {
  ApplicationError,
  ProblemNotFoundError,
  AttemptNotFoundError,
  RubricNotFoundError,
  MissingSubmissionError,
  InvalidSubmissionError,
} from './errors';
