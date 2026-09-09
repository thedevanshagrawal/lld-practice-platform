import type { Db } from 'mongodb';
import type { Problem } from '../../domain/Problem';
import type { Rubric } from '../../domain/rubric/Rubric';
import type { ProblemDoc, RubricDoc } from './documents';
import { COLLECTIONS } from './connection';
import { problemToDoc, rubricToDoc } from './mappers';
import { ensureIndexes } from './indexes';
import { SEED_PROBLEMS, SEED_RUBRICS, assertSeedDataIsWellFormed } from '../../seed';

export interface SeedSummary {
  readonly problemsUpserted: number;
  readonly rubricsUpserted: number;
}

/**
 * Idempotent: upserts by id, so running it twice changes nothing and never
 * duplicates. Rubrics are keyed by `${id}@${version}`, so seeding a NEW version adds
 * a document rather than rewriting the ruler that historical evaluations were scored
 * under.
 *
 * This lives in infrastructure rather than in `src/seed` because only infrastructure
 * is allowed to know a database exists. `src/seed` is pure data.
 */
export async function seedDatabase(
  db: Db,
  data: { problems?: readonly Problem[]; rubrics?: readonly Rubric[] } = {},
): Promise<SeedSummary> {
  const problems = data.problems ?? SEED_PROBLEMS;
  const rubrics = data.rubrics ?? SEED_RUBRICS;

  if (data.problems === undefined && data.rubrics === undefined) {
    // Weights sum to 1, keys unique, every problem points at a seeded rubric.
    assertSeedDataIsWellFormed();
  }

  await ensureIndexes(db);

  const rubricCollection = db.collection<RubricDoc>(COLLECTIONS.rubrics);
  for (const rubric of rubrics) {
    const { _id, ...rest } = rubricToDoc(rubric);
    await rubricCollection.replaceOne({ _id }, rest as RubricDoc, { upsert: true });
  }

  const problemCollection = db.collection<ProblemDoc>(COLLECTIONS.problems);
  for (const problem of problems) {
    const { _id, ...rest } = problemToDoc(problem);
    await problemCollection.replaceOne({ _id }, rest as ProblemDoc, { upsert: true });
  }

  return { problemsUpserted: problems.length, rubricsUpserted: rubrics.length };
}
