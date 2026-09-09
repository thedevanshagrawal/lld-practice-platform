/**
 * The ONLY place outside `src/infrastructure/mongo/connection.ts` that reads
 * `process.env`.
 *
 * Environment is a deployment fact, not a domain fact. Keeping the reads here is what
 * lets `src/domain` and `src/application` be imported by a test with zero setup: they
 * receive already-resolved values through constructors and never ask the process
 * anything.
 *
 * Nothing here imports `node:fs` — this module is pulled into every route handler, so
 * it stays a plain `process.env` read. The dotenv loader the CLI seed script needs
 * lives in `loadEnvFile.ts`, which only that script imports.
 */

export interface AppEnv {
  /** Absent means "run on the in-memory repositories" — an explicit supported mode. */
  readonly mongodbUri: string | null;
  readonly mongodbDb: string | null;
  /** Absent means the LLM half is unconfigured; attempts end FAILED and are re-runnable. */
  readonly geminiApiKey: string | null;
  readonly geminiModel: string | null;
  /** Guards GET /api/cron/recover when set. Vercel Cron sends it as a Bearer token. */
  readonly cronSecret: string | null;
}

function read(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readEnv(): AppEnv {
  return {
    mongodbUri: read('MONGODB_URI'),
    mongodbDb: read('MONGODB_DB'),
    geminiApiKey: read('GEMINI_API_KEY'),
    geminiModel: read('GEMINI_MODEL'),
    cronSecret: read('CRON_SECRET'),
  };
}
