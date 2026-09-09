import { NextResponse } from 'next/server';
import { getContainer } from '@/composition';
import { toProblemDto, toRubricDto } from '../../_lib/dto';
import { jsonError } from '../../_lib/http';

export const dynamic = 'force-dynamic';

/** `id` is an id OR a slug — GetProblem resolves either, so the UI can route on slugs. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const { getProblem } = await getContainer();
    const { problem, rubric } = await getProblem.execute({ problemRef: id });
    return NextResponse.json({
      problem: toProblemDto(problem),
      rubric: toRubricDto(rubric),
    });
  } catch (error) {
    return jsonError(error);
  }
}
