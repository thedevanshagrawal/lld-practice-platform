import { NextResponse } from 'next/server';
import { getContainer } from '@/composition';
import { toProblemDto } from '../_lib/dto';
import { jsonError } from '../_lib/http';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const { listProblems } = await getContainer();
    const problems = await listProblems.execute();
    return NextResponse.json({ problems: problems.map(toProblemDto) });
  } catch (error) {
    return jsonError(error);
  }
}
