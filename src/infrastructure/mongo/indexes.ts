import type { Db } from 'mongodb';
import { COLLECTIONS } from './connection';

/**
 * Every index here exists for a named query or a named invariant. Nothing is
 * speculative.
 *
 * The load-bearing one is `uniq_learner_idempotency`. Application-level idempotency
 * is a check-then-write, so two concurrent double-clicks can both pass the check.
 * The unique index is what makes "same key twice = exactly one submission" true under
 * concurrency rather than merely likely — the second write fails with E11000 and the
 * caller resolves to the attempt that already exists.
 *
 * It is partial because a DRAFT attempt has no submission, and a plain unique index
 * over a missing field would collide every draft with every other draft.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection(COLLECTIONS.problems).createIndexes([
    { key: { slug: 1 }, name: 'uniq_slug', unique: true },
  ]);

  await db.collection(COLLECTIONS.rubrics).createIndexes([
    { key: { rubricId: 1, version: -1 }, name: 'uniq_rubric_version', unique: true },
  ]);

  await db.collection(COLLECTIONS.attempts).createIndexes([
    {
      key: { learnerId: 1, 'submission.idempotencyKey': 1 },
      name: 'uniq_learner_idempotency',
      unique: true,
      partialFilterExpression: { 'submission.idempotencyKey': { $exists: true } },
    },
    // History: list a learner's attempts at one problem, in order.
    { key: { learnerId: 1, problemId: 1, attemptNumber: 1 }, name: 'learner_problem_attempt' },
    // Recovery sweep: attempts stranded in SUBMITTED or EVALUATING past a cutoff.
    { key: { status: 1, activityAt: 1 }, name: 'status_activity' },
  ]);

  await db.collection(COLLECTIONS.evaluations).createIndexes([
    // Latest run for an attempt, and the re-run counter. Unique because two runs
    // cannot share a run number for the same attempt.
    { key: { attemptId: 1, runNumber: -1 }, name: 'uniq_attempt_run', unique: true },
  ]);
}

/** True when a write failed because it collided with a unique index. */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}
