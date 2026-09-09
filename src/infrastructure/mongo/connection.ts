import { MongoClient, type Db } from 'mongodb';

/**
 * One client per process, reused across requests.
 *
 * Next.js dev reloads modules on every edit, so the client is cached on globalThis;
 * without that, a few minutes of editing exhausts the Atlas connection limit. This is
 * the only place in the codebase that reads `process.env`, and the only place that
 * knows a database exists at all beyond this folder.
 */

export const COLLECTIONS = {
  problems: 'problems',
  rubrics: 'rubrics',
  attempts: 'attempts',
  evaluations: 'evaluations',
} as const;

const DEFAULT_DB_NAME = 'lld_practice';

interface MongoCache {
  client: MongoClient | null;
  promise: Promise<MongoClient> | null;
}

const globalCache = globalThis as unknown as { __lldMongo?: MongoCache };
const cache: MongoCache = globalCache.__lldMongo ?? { client: null, promise: null };
globalCache.__lldMongo = cache;

export function mongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Copy .env.example to .env.local, or wire the ' +
        'in-memory repositories instead — they implement the same ports.',
    );
  }
  return uri;
}

export async function getMongoClient(): Promise<MongoClient> {
  if (cache.client) return cache.client;

  if (!cache.promise) {
    cache.promise = new MongoClient(mongoUri(), {
      // Fail fast rather than hanging a learner's request behind a dead cluster.
      serverSelectionTimeoutMS: 5000,
      // Explicit: `undefined` must never be silently swallowed on the way to disk.
      // It is a bug in a mapper, and we want it stored as null and caught, not lost.
      ignoreUndefined: false,
    }).connect();
  }

  cache.client = await cache.promise;
  return cache.client;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB ?? DEFAULT_DB_NAME);
}

/** Test/script teardown. Safe to call when nothing was ever connected. */
export async function closeMongoClient(): Promise<void> {
  const client = cache.client ?? (cache.promise ? await cache.promise : null);
  cache.client = null;
  cache.promise = null;
  if (client) await client.close();
}
