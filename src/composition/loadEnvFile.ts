import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A five-line dotenv reader for the CLI entry points (`npm run seed`).
 *
 * Next.js loads `.env.local` for `next dev` / `next build` on its own, so the web app
 * never needs this. A plain `vite-node` script does not, and adding `dotenv` for one
 * script is a dependency the reviewer would rightly ask about.
 *
 * Existing `process.env` values always win, so CI and Vercel are never overridden by a
 * stray local file.
 */
const CANDIDATES = ['.env.local', '.env'] as const;

export function loadEnvFiles(cwd: string = process.cwd()): void {
  for (const candidate of CANDIDATES) {
    const path = resolve(cwd, candidate);
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;

      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;

      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
