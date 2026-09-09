/**
 * `npm run seed` — the first command the README tells a reviewer to run.
 *
 * It is a composition-root concern, not a domain one: it reads the environment, opens a
 * connection, and calls `seedDatabase`, which is the piece that actually knows what a
 * problem document looks like. `src/seed` stays pure data and `src/infrastructure/mongo`
 * stays unaware of `process.env`.
 *
 * Idempotent, because `seedDatabase` upserts by id. Running it twice is a no-op.
 */

import { closeMongoClient, getDb, seedDatabase } from '@/infrastructure/mongo';
import { readEnv } from './env';
import { loadEnvFiles } from './loadEnvFile';

async function main(): Promise<void> {
  loadEnvFiles();

  const env = readEnv();
  if (!env.mongodbUri) {
    console.error(
      'MONGODB_URI is not set, so there is no database to seed.\n' +
        'Copy .env.example to .env.local and set it, or run the app without it — ' +
        'the composition root falls back to in-memory repositories that are already ' +
        'seeded from src/seed, and no seeding step is needed in that mode.',
    );
    process.exitCode = 1;
    return;
  }

  const db = await getDb();
  const summary = await seedDatabase(db);

  console.log(
    `Seeded ${summary.problemsUpserted} problems and ${summary.rubricsUpserted} rubric ` +
      `version(s) into "${db.databaseName}". Re-running this changes nothing.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Seeding failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
