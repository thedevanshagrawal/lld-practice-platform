import type { Collection, Db } from 'mongodb';
import type { Problem } from '../../domain/Problem';
import type { ProblemId } from '../../domain/ids';
import type { ProblemRepository } from '../../domain/ports/ProblemRepository';
import type { ProblemDoc } from './documents';
import { COLLECTIONS } from './connection';
import { problemFromDoc } from './mappers';

export class MongoProblemRepository implements ProblemRepository {
  private readonly problems: Collection<ProblemDoc>;

  constructor(db: Db) {
    this.problems = db.collection<ProblemDoc>(COLLECTIONS.problems);
  }

  async findById(id: ProblemId): Promise<Problem | null> {
    const doc = await this.problems.findOne({ _id: id });
    return doc ? problemFromDoc(doc) : null;
  }

  async findBySlug(slug: string): Promise<Problem | null> {
    const doc = await this.problems.findOne({ slug });
    return doc ? problemFromDoc(doc) : null;
  }

  async list(): Promise<readonly Problem[]> {
    const docs = await this.problems.find({}).sort({ title: 1 }).toArray();
    return docs.map(problemFromDoc);
  }
}
