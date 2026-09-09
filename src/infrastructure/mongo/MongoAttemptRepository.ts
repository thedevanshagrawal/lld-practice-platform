import type { Collection, Db } from 'mongodb';
import type { Attempt } from '../../domain/attempt/Attempt';
import type { AttemptStatus } from '../../domain/attempt/AttemptStatus';
import type { AttemptId, LearnerId, ProblemId } from '../../domain/ids';
import type { AttemptRepository } from '../../domain/ports/AttemptRepository';
import type { AttemptDoc } from './documents';
import { COLLECTIONS } from './connection';
import { attemptFromDoc, attemptToDoc } from './mappers';

/**
 * The attempt and its submission are one document, therefore one write.
 *
 * That is the whole store-before-evaluate guarantee: there is no window in which an
 * attempt is SUBMITTED with no stored content, because the status and the content go
 * to disk in the same operation. Splitting Submission into its own collection would
 * reintroduce exactly that window, which is why there is no SubmissionRepository.
 */
export class MongoAttemptRepository implements AttemptRepository {
  private readonly attempts: Collection<AttemptDoc>;

  constructor(db: Db) {
    this.attempts = db.collection<AttemptDoc>(COLLECTIONS.attempts);
  }

  async findById(id: AttemptId): Promise<Attempt | null> {
    const doc = await this.attempts.findOne({ _id: id });
    return doc ? attemptFromDoc(doc) : null;
  }

  async findByIdempotencyKey(
    learnerId: LearnerId,
    idempotencyKey: string,
  ): Promise<Attempt | null> {
    const doc = await this.attempts.findOne({
      learnerId,
      'submission.idempotencyKey': idempotencyKey,
    });
    return doc ? attemptFromDoc(doc) : null;
  }

  async listByLearnerAndProblem(
    learnerId: LearnerId,
    problemId: ProblemId,
  ): Promise<readonly Attempt[]> {
    const docs = await this.attempts
      .find({ learnerId, problemId })
      .sort({ attemptNumber: 1 })
      .toArray();
    return docs.map(attemptFromDoc);
  }

  async countByLearnerAndProblem(
    learnerId: LearnerId,
    problemId: ProblemId,
  ): Promise<number> {
    return this.attempts.countDocuments({ learnerId, problemId });
  }

  /**
   * One upsert of the whole document. Not a `$set` of changed fields: the aggregate
   * decides its own consistent state, and a partial update is how a status ends up
   * saved without the submission that justified it.
   */
  async save(attempt: Attempt): Promise<void> {
    const doc = attemptToDoc(attempt);
    const { _id, ...rest } = doc;
    await this.attempts.replaceOne({ _id }, rest as AttemptDoc, { upsert: true });
  }

  /**
   * Recovery sweep. `activityAt` is indexed with `status`, so this is a range scan on
   * a compound index rather than a collection scan — it can run on a timer without
   * competing with the learner's read path.
   */
  async findStale(status: AttemptStatus, olderThan: Date): Promise<readonly Attempt[]> {
    const docs = await this.attempts
      .find({ status, activityAt: { $lt: olderThan } })
      .sort({ activityAt: 1 })
      .toArray();
    return docs.map(attemptFromDoc);
  }
}
