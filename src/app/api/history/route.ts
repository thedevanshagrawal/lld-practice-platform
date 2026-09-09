import { NextResponse } from 'next/server';
import { getContainer } from '@/composition';
import { toHistoryDto } from '../_lib/dto';
import { badRequest, jsonError } from '../_lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/history?learnerId=&problemId= — per-criterion movement across attempts. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const learnerId = url.searchParams.get('learnerId')?.trim() ?? '';
    const problemId = url.searchParams.get('problemId')?.trim() ?? '';

    if (learnerId.length === 0) return badRequest('learnerId query parameter is required.');
    if (problemId.length === 0) return badRequest('problemId query parameter is required.');

    const { getHistory } = await getContainer();
    const result = await getHistory.execute({ learnerId, problemId });

    return NextResponse.json(toHistoryDto(result), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return jsonError(error);
  }
}
