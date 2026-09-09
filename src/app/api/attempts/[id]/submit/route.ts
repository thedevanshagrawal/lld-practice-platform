import { NextResponse } from 'next/server';
import { getContainer } from '@/composition';
import { SubmissionBodyError, parseSubmissionBody } from '../../../_lib/dto';
import { badRequest, jsonError, readJson } from '../../../_lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/attempts/[id]/submit — persist the submission, return 202, evaluate later.
 *
 * ---------------------------------------------------------------------------
 * THE VERCEL ASYNC PROBLEM, AND WHY THIS ROUTE DOES NOT SOLVE IT BY ITSELF
 * ---------------------------------------------------------------------------
 * The textbook answer is to kick off evaluation here without awaiting it
 * (`createInlineEvaluationScheduler` in the application layer does exactly that). On a
 * long-running Node server that works. On Vercel it is a bug: a serverless function can
 * be frozen as soon as the response is flushed, so an un-awaited promise may never run
 * — and it fails SILENTLY, which is worse than failing loudly, because the attempt just
 * sits in SUBMITTED forever with no error anywhere.
 *
 * Awaiting the Gemini call here instead is the other tempting answer, and it is worse:
 * it puts a 25-60 s network call on the learner's write path, which is the one thing the
 * design says must never happen (a submission must never be lost to an evaluator).
 *
 * So the handoff is made EXPLICIT rather than implicit, in three layers:
 *
 *   1. This route persists and returns 202 with `evaluateUrl`. It never calls Gemini.
 *   2. The CLIENT posts to that URL immediately after a successful submit. The browser
 *      is a process nobody can freeze, so the trigger is reliable, and the polling loop
 *      it already runs makes progress visible.
 *   3. `GET /api/cron/recover` sweeps attempts stranded in SUBMITTED or EVALUATING
 *      (via `AttemptRepository.findStale`) and re-runs them. That covers the closed tab,
 *      the dropped connection, and the function frozen mid-evaluation. It is a cron
 *      entry in vercel.json, not a queue — the AttemptStatus field is already the job
 *      record, so a queue would be a second source of truth for no gain at this size.
 *
 * The honest cost: feedback needs the client to still be there, or it waits for the next
 * cron tick. That is a real limitation and it is stated in the README rather than hidden.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = await readJson(request);

    // Header wins, body is the fallback — a retrying HTTP client sets the header.
    const headerKey = request.headers.get('idempotency-key')?.trim();
    const parsed = parseSubmissionBody(
      headerKey ? { ...body, idempotencyKey: headerKey } : body,
    );

    const { submitAttempt } = await getContainer();
    const result = await submitAttempt.execute({
      attemptId: id,
      content: parsed.content,
      idempotencyKey: parsed.idempotencyKey,
    });

    return NextResponse.json(
      {
        attemptId: result.attemptId,
        submissionId: result.submissionId,
        status: result.status,
        submittedAt: result.submittedAt.toISOString(),
        duplicate: result.duplicate,
        /** Step 2 of the handoff above. The client posts here next. */
        evaluateUrl: `/api/attempts/${result.attemptId}/evaluate`,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof SubmissionBodyError) return badRequest(error.message);
    if (error instanceof SyntaxError) return badRequest(error.message);
    return jsonError(error);
  }
}
