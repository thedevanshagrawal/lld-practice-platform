import type { Collection, Db } from 'mongodb';
import type { Evaluation } from '../../domain/evaluation/Evaluation';
import type { AttemptId, EvaluationId } from '../../domain/ids';
import type { EvaluationRepository } from '../../domain/ports/EvaluationRepository';
import type { EvaluationDoc } from './documents';
import { COLLECTIONS } from './connection';
import { evaluationFromDoc, evaluationToDoc } from './mappers';

/**
 * A separate collection from attempts, because the lifecycles are different: the
 * pipeline writes here seconds to minutes after the learner submitted, and re-runs
 * append. Folding this into the attempt document would mean the background worker
 * rewriting the document the learner is currently polling.
 */
export class MongoEvaluationRepository implements EvaluationRepository {
  private readonly evaluations: Collection<EvaluationDoc>;

  constructor(db: Db) {
    this.evaluations = db.collection<EvaluationDoc>(COLLECTIONS.evaluations);
  }

  async save(evaluation: Evaluation): Promise<void> {
    // evaluationToDoc throws if any result lost its evidence. A run with an
    // unevidenced score does not reach disk.
    const doc = evaluationToDoc(evaluation);
    const { _id, ...rest } = doc;
    await this.evaluations.replaceOne({ _id }, rest as EvaluationDoc, { upsert: true });
  }

  async findById(id: EvaluationId): Promise<Evaluation | null> {
    const doc = await this.evaluations.findOne({ _id: id });
    return doc ? evaluationFromDoc(doc) : null;
  }

  async findLatestByAttemptId(attemptId: AttemptId): Promise<Evaluation | null> {
    const doc = await this.evaluations.findOne(
      { attemptId },
      { sort: { runNumber: -1 } },
    );
    return doc ? evaluationFromDoc(doc) : null;
  }

  /** One query for the whole history view, not one per attempt. */
  async latestForAttempts(
    attemptIds: readonly AttemptId[],
  ): Promise<readonly Evaluation[]> {
    if (attemptIds.length === 0) return [];

    const docs = await this.evaluations
      .find({ attemptId: { $in: [...attemptIds] } })
      .sort({ runNumber: -1 })
      .toArray();

    const latest = new Map<AttemptId, EvaluationDoc>();
    for (const doc of docs) {
      if (!latest.has(doc.attemptId)) latest.set(doc.attemptId, doc);
    }

    return [...latest.values()].map(evaluationFromDoc);
  }

  async countRunsForAttempt(attemptId: AttemptId): Promise<number> {
    return this.evaluations.countDocuments({ attemptId });
  }
}
