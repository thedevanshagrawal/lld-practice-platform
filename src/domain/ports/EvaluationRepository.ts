import type { Evaluation } from '../evaluation/Evaluation';
import type { AttemptId, EvaluationId } from '../ids';

export interface EvaluationRepository {
  /** Append-only in practice: a re-run saves a new run, it never overwrites. */
  save(evaluation: Evaluation): Promise<void>;
  findById(id: EvaluationId): Promise<Evaluation | null>;
  /** Highest runNumber for the attempt. */
  findLatestByAttemptId(attemptId: AttemptId): Promise<Evaluation | null>;
  /** Latest run per attempt, for the history view. One query, not N. */
  latestForAttempts(attemptIds: readonly AttemptId[]): Promise<readonly Evaluation[]>;
  countRunsForAttempt(attemptId: AttemptId): Promise<number>;
}
