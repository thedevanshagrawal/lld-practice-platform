import type { Collection, Db } from 'mongodb';
import type { Rubric } from '../../domain/rubric/Rubric';
import type { RubricId } from '../../domain/ids';
import type { RubricRepository } from '../../domain/ports/RubricRepository';
import type { RubricDoc } from './documents';
import { COLLECTIONS } from './connection';
import { rubricFromDoc } from './mappers';

/**
 * Every rubric version is a separate document and none are ever overwritten. An
 * Evaluation stores the version it was scored under, so a two-year-old attempt can
 * still be rendered against the ruler that produced its scores.
 */
export class MongoRubricRepository implements RubricRepository {
  private readonly rubrics: Collection<RubricDoc>;

  constructor(db: Db) {
    this.rubrics = db.collection<RubricDoc>(COLLECTIONS.rubrics);
  }

  async findById(id: RubricId, version?: number): Promise<Rubric | null> {
    const doc =
      version === undefined
        ? await this.rubrics.findOne({ rubricId: id }, { sort: { version: -1 } })
        : await this.rubrics.findOne({ rubricId: id, version });

    return doc ? rubricFromDoc(doc) : null;
  }
}
