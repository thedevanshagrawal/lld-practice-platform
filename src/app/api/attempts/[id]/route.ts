import { NextResponse } from 'next/server';
import { getContainer } from '@/composition';
import { toAttemptDto } from '../../_lib/dto';
import { jsonError } from '../../_lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attempts/[id] — the polling read.
 *
 * Returns the evaluation even when the attempt is FAILED, so partial per-criterion
 * feedback stays on screen next to the re-run button instead of being replaced by an
 * error page.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const { getAttempt } = await getContainer();
    const result = await getAttempt.execute({ attemptId: id });
    return NextResponse.json(toAttemptDto(result), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return jsonError(error);
  }
}
