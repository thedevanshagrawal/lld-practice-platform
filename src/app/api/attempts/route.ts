import { NextResponse } from 'next/server';
import { getContainer } from '@/composition';
import { asString, badRequest, jsonError, readJson } from '../_lib/http';

export const dynamic = 'force-dynamic';

/** POST /api/attempts — StartAttempt. Creates a DRAFT the learner then submits into. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJson(request);
    const learnerId = asString(body.learnerId).trim();
    const problemId = asString(body.problemId).trim();

    if (learnerId.length === 0) return badRequest('learnerId is required.');
    if (problemId.length === 0) return badRequest('problemId is required.');

    const { startAttempt } = await getContainer();
    const result = await startAttempt.execute({ learnerId, problemId });

    return NextResponse.json(
      {
        attemptId: result.attemptId,
        attemptNumber: result.attemptNumber,
        status: result.status,
        createdAt: result.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) return badRequest(error.message);
    return jsonError(error);
  }
}
