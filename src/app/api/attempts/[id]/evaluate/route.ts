import { NextResponse } from 'next/server';
import { getContainer } from '@/composition';
import { jsonError } from '../../../_lib/http';

export const dynamic = 'force-dynamic';

/**
 * The evaluator's own budget is 60 s (per-call 25 s, one retry, one repair call). The
 * function must outlive it or a healthy-but-slow evaluation gets killed halfway and the
 * attempt is stranded in EVALUATING until the recovery cron picks it up.
 */
export const maxDuration = 60;

/**
 * POST /api/attempts/[id]/evaluate — RunEvaluation, awaited.
 *
 * Two callers, one handler:
 *   - the client, immediately after a successful submit (the reliable trigger described
 *     in ../submit/route.ts);
 *   - the learner pressing "Re-run evaluation" on a FAILED attempt. `FAILED ->
 *     EVALUATING` is a legal transition in the domain's table, so a re-run costs nothing
 *     here and never asks the learner to re-type their design.
 *
 * Awaiting is correct on THIS route (unlike on submit) because nothing the learner is
 * waiting on is at risk: the submission is already stored. If this request is cut off —
 * a closed tab, a proxy timeout — the attempt is left in EVALUATING and the recovery
 * sweep re-runs it. The client also polls GET /api/attempts/[id] independently, so it
 * learns the outcome even when this response never arrives.
 *
 * A second concurrent call loses the EVALUATING lock race and gets 409, not a second
 * Gemini bill.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const { runEvaluation } = await getContainer();
    const result = await runEvaluation.execute({ attemptId: id });

    return NextResponse.json({
      attemptId: result.attemptId,
      evaluationId: result.evaluationId,
      runNumber: result.runNumber,
      outcome: result.outcome,
      status: result.status,
      failures: result.failures.map((f) => ({
        tag: f.tag,
        adapter: f.adapter,
        reason: f.reason,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
