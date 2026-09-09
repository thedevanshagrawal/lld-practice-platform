import { NextResponse } from 'next/server';
import { readEnv } from '@/composition';
import { recoverStaleAttempts } from '@/composition/recoverStaleAttempts';
import { jsonError } from '../../_lib/http';

export const dynamic = 'force-dynamic';

/** Up to MAX_PER_SWEEP evaluations, each with a 60 s budget of its own. */
export const maxDuration = 300;

/**
 * GET /api/cron/recover — the scheduled backstop for evaluations that were never
 * triggered or never finished. Wired in vercel.json; see recoverStaleAttempts.ts for
 * why this exists rather than a queue.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. When CRON_SECRET is unset the
 * route is open, which is the right default for local development and stated as a
 * limitation in the README — the sweep is idempotent and only ever re-runs work the
 * learner already asked for, so an open endpoint costs Gemini calls, not data.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { cronSecret } = readEnv();
    if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const summary = await recoverStaleAttempts();
    return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}
