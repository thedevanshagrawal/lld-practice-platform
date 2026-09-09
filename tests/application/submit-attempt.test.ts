import { describe, it, expect } from 'vitest';

import type { AttemptStatus } from '@/domain/attempt/AttemptStatus';
import { InvalidSubmissionError } from '@/application/errors';

import { weakParkingLotContent } from '../support/content';
import { LEARNER_ID, PROBLEM_ID, SUBMITTED_AT, makeWorld } from '../support/world';

describe('SubmitAttempt', () => {
  it('creates exactly one submission when called twice with the same idempotency key', async () => {
    const world = makeWorld();
    const { attemptId } = await world.start.execute({
      learnerId: LEARNER_ID,
      problemId: PROBLEM_ID,
    });

    const input = {
      attemptId,
      content: weakParkingLotContent(),
      idempotencyKey: 'retry-me',
    };

    const first = await world.submit.execute(input);
    const second = await world.submit.execute(input);

    expect(second.submissionId).toBe(first.submissionId);
    expect(first.submissionId).toBe('sub-1');
    expect(world.attempts.submissionsFor(attemptId)).toEqual(['sub-1']);

    // The assertion that catches the naive fix. A `return` that still re-emits the
    // status transition passes the count check above and is still wrong: the second
    // save writes a second SUBMITTED row into the audit trail for one submission.
    // 'DRAFT' is StartAttempt's own save; SUBMITTED must appear exactly once.
    const changes: readonly AttemptStatus[] = world.attempts.statusChangesFor(attemptId);
    expect(changes).toEqual(['DRAFT', 'SUBMITTED']);
    expect(changes.filter((s) => s === 'SUBMITTED')).toHaveLength(1);
  });

  it('flags the repeated call as a duplicate and returns the original submittedAt', async () => {
    const world = makeWorld();
    const { attemptId } = await world.start.execute({
      learnerId: LEARNER_ID,
      problemId: PROBLEM_ID,
    });
    const input = { attemptId, content: weakParkingLotContent(), idempotencyKey: 'retry-me' };

    const first = await world.submit.execute(input);
    const second = await world.submit.execute(input);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.attemptId).toBe(attemptId);
    expect(second.submittedAt.toISOString()).toBe(SUBMITTED_AT);
    expect(second.status).toBe('SUBMITTED');
  });

  /**
   * Brief section 10: store before evaluating. This ordering is the only reason the
   * reliability test in evaluation-resilience.test.ts can pass at all — a submission
   * that reaches the evaluator before it reaches storage is a submission that a Gemini
   * outage can delete.
   */
  it('persists the submission before the evaluation is scheduled', async () => {
    const savesAtScheduleTime: AttemptStatus[][] = [];

    const world = makeWorld({
      scheduleEvaluation: (w) => () => {
        savesAtScheduleTime.push(w.attempts.saves.map((s) => s.status));
      },
    });

    const { attemptId } = await world.start.execute({
      learnerId: LEARNER_ID,
      problemId: PROBLEM_ID,
    });
    await world.submit.execute({
      attemptId,
      content: weakParkingLotContent(),
      idempotencyKey: 'k-1',
    });

    expect(savesAtScheduleTime).toHaveLength(1);
    expect(savesAtScheduleTime[0]).toEqual(['DRAFT', 'SUBMITTED']);
  });

  it('does not schedule a second evaluation for a repeated idempotency key', async () => {
    let scheduled = 0;
    const world = makeWorld({ scheduleEvaluation: () => () => { scheduled += 1; } });

    const { attemptId } = await world.start.execute({
      learnerId: LEARNER_ID,
      problemId: PROBLEM_ID,
    });
    const input = { attemptId, content: weakParkingLotContent(), idempotencyKey: 'k-1' };

    await world.submit.execute(input);
    await world.submit.execute(input);

    expect(scheduled).toBe(1);
  });

  /**
   * A broken scheduler must never fail a submission that is already safely persisted.
   * The attempt waits in SUBMITTED for the recovery sweep instead of losing the work.
   */
  it('keeps the submission when the scheduler throws', async () => {
    const world = makeWorld({
      scheduleEvaluation: () => () => {
        throw new Error('scheduler exploded');
      },
    });

    const { attemptId } = await world.start.execute({
      learnerId: LEARNER_ID,
      problemId: PROBLEM_ID,
    });

    const result = await world.submit.execute({
      attemptId,
      content: weakParkingLotContent(),
      idempotencyKey: 'k-1',
    });

    expect(result.status).toBe('SUBMITTED');
    const stored = await world.attempts.findById(attemptId);
    expect(stored?.submission?.id).toBe('sub-1');
  });

  it('refuses a blank idempotency key rather than inventing one', async () => {
    const world = makeWorld();
    const { attemptId } = await world.start.execute({
      learnerId: LEARNER_ID,
      problemId: PROBLEM_ID,
    });

    await expect(
      world.submit.execute({
        attemptId,
        content: weakParkingLotContent(),
        idempotencyKey: '   ',
      }),
    ).rejects.toBeInstanceOf(InvalidSubmissionError);

    expect(world.attempts.submissionsFor(attemptId)).toEqual([]);
  });
});
