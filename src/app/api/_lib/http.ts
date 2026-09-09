import { NextResponse } from 'next/server';
import { ApplicationError } from '@/application';
import { IllegalAttemptTransitionError } from '@/domain/errors';

/**
 * One error map for every route handler.
 *
 * It branches on error CLASS and reads `code`, never on message text. That is the point
 * of `ApplicationError` and `DomainError` carrying a `code`: the HTTP layer is the only
 * thing that knows what a 404 is, and the layers below it never learn.
 */
export function jsonError(error: unknown): NextResponse {
  if (error instanceof ApplicationError) {
    const status =
      error.code === 'PROBLEM_NOT_FOUND' ||
      error.code === 'ATTEMPT_NOT_FOUND' ||
      error.code === 'RUBRIC_NOT_FOUND'
        ? 404
        : 400;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }

  if (error instanceof IllegalAttemptTransitionError) {
    // e.g. two evaluate calls racing. The first one holds the EVALUATING lock; the
    // second is a conflict, not a server fault.
    return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error('[api] unhandled error:', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: 'BAD_REQUEST', message }, { status: 400 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('body must be a JSON object');
    }
    return body as Record<string, unknown>;
  } catch {
    throw new SyntaxError('Request body must be a JSON object.');
  }
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
