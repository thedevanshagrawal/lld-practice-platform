import type { Attempt } from '../attempt/Attempt';
import type { AttemptStatus } from '../attempt/AttemptStatus';
import type { AttemptId, LearnerId, ProblemId } from '../ids';

export interface AttemptRepository {
  findById(id: AttemptId): Promise<Attempt | null>;

  /**
   * Idempotency: a repeated submit resolves to the attempt already created.
   * The key is scoped to the learner because it is client-supplied.
   */
  findByIdempotencyKey(
    learnerId: LearnerId,
    idempotencyKey: string,
  ): Promise<Attempt | null>;

  /** Ordered by attemptNumber ascending. History ordering is a repository promise. */
  listByLearnerAndProblem(
    learnerId: LearnerId,
    problemId: ProblemId,
  ): Promise<readonly Attempt[]>;

  countByLearnerAndProblem(
    learnerId: LearnerId,
    problemId: ProblemId,
  ): Promise<number>;

  /**
   * Persists the attempt AND its submission together. One write.
   * This single call is the whole store-before-evaluate guarantee.
   */
  save(attempt: Attempt): Promise<void>;

  /** Recovery sweep: attempts stuck in SUBMITTED or EVALUATING past a cutoff. */
  findStale(status: AttemptStatus, olderThan: Date): Promise<readonly Attempt[]>;
}
