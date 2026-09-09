import { describe, it, expect } from 'vitest';

import { Attempt } from '@/domain/attempt/Attempt';
import type { Submission } from '@/domain/attempt/Submission';
import { IllegalAttemptTransitionError } from '@/domain/errors';
import { TextDesignContent } from '@/domain/content/TextDesignContent';

const CREATED_AT = new Date('2026-09-10T09:00:00.000Z');
const SUBMITTED_AT = new Date('2026-09-10T10:00:00.000Z');

function draft(): Attempt {
  return Attempt.start({
    id: 'att-1',
    learnerId: 'learner-1',
    problemId: 'problem-parking-lot',
    attemptNumber: 1,
    createdAt: CREATED_AT,
  });
}

function submission(id = 'sub-1'): Submission {
  return {
    id,
    attemptId: 'att-1',
    content: TextDesignContent.fromSections({
      assumptions: ['One site.'],
      classes: [{ name: 'ParkingLot', responsibility: 'holds slots', methodNames: ['park()'] }],
      relationships: [],
      tradeOffs: [],
    }),
    submittedAt: SUBMITTED_AT,
    idempotencyKey: `key-${id}`,
  };
}

describe('Attempt state machine', () => {
  // D1 — the positive control. Without it a machine that rejects everything would
  // pass every negative test below.
  it('walks DRAFT -> SUBMITTED -> EVALUATING -> COMPLETED and reads back at each step', () => {
    const attempt = draft();
    expect(attempt.status).toBe('DRAFT');

    attempt.submit(submission());
    expect(attempt.status).toBe('SUBMITTED');
    expect(attempt.submission?.id).toBe('sub-1');

    attempt.beginEvaluation();
    expect(attempt.status).toBe('EVALUATING');

    attempt.completeEvaluation('eval-1');
    expect(attempt.status).toBe('COMPLETED');
    expect(attempt.latestEvaluationId).toBe('eval-1');
  });

  // D2 — an attempt may only be COMPLETED after evaluation actually ran. Skipping the
  // machine is how a learner gets feedback that was never produced.
  it('rejects DRAFT -> COMPLETED directly', () => {
    const attempt = draft();

    expect(() => attempt.completeEvaluation('eval-1')).toThrow(IllegalAttemptTransitionError);
    expect(attempt.status).toBe('DRAFT');
    expect(attempt.latestEvaluationId).toBeNull();
  });

  it('rejects DRAFT -> EVALUATING, because there is no submission to evaluate', () => {
    const attempt = draft();

    expect(() => attempt.beginEvaluation()).toThrow(IllegalAttemptTransitionError);
    expect(attempt.status).toBe('DRAFT');
  });

  // D3 — the impatient learner double-clicks. The invariant belongs here, not in a
  // disabled button.
  it('rejects a second submit and leaves the original submission untouched', () => {
    const attempt = draft();
    attempt.submit(submission('sub-1'));

    expect(() => attempt.submit(submission('sub-2'))).toThrow(IllegalAttemptTransitionError);

    expect(attempt.status).toBe('SUBMITTED');
    expect(attempt.submission?.id).toBe('sub-1');
    expect(attempt.submission?.submittedAt.toISOString()).toBe(SUBMITTED_AT.toISOString());
  });

  it('rejects a submit on an attempt already EVALUATING', () => {
    const attempt = draft();
    attempt.submit(submission());
    attempt.beginEvaluation();

    expect(() => attempt.submit(submission('sub-2'))).toThrow(IllegalAttemptTransitionError);
    expect(attempt.submission?.id).toBe('sub-1');
  });

  // D4 — the brief's reliability requirement, written as code: a failed evaluation is
  // re-runnable WITHOUT re-submitting.
  it('allows FAILED -> EVALUATING so a failed evaluation can be re-run', () => {
    const attempt = draft();
    attempt.submit(submission());
    attempt.beginEvaluation();
    attempt.failEvaluation('LLM_TIMEOUT', 'eval-1');

    expect(attempt.status).toBe('FAILED');
    expect(attempt.failureReason).toBe('LLM_TIMEOUT');
    // The partial evaluation is kept, so FAILED never means "your feedback is gone".
    expect(attempt.latestEvaluationId).toBe('eval-1');
    expect(attempt.canTransitionTo('EVALUATING')).toBe(true);

    attempt.beginEvaluation();
    expect(attempt.status).toBe('EVALUATING');
    // Re-running clears the stale reason but keeps the submission.
    expect(attempt.failureReason).toBeNull();
    expect(attempt.submission?.id).toBe('sub-1');
  });

  it('rejects FAILED -> SUBMITTED, because a re-run must not re-open the write path', () => {
    const attempt = draft();
    attempt.submit(submission());
    attempt.beginEvaluation();
    attempt.failEvaluation('LLM_TIMEOUT', null);

    expect(attempt.canTransitionTo('SUBMITTED')).toBe(false);
    expect(() => attempt.submit(submission('sub-2'))).toThrow(IllegalAttemptTransitionError);
    expect(attempt.status).toBe('FAILED');
  });

  it('treats COMPLETED as terminal', () => {
    const attempt = draft();
    attempt.submit(submission());
    attempt.beginEvaluation();
    attempt.completeEvaluation('eval-1');

    expect(attempt.canTransitionTo('EVALUATING')).toBe(false);
    expect(() => attempt.beginEvaluation()).toThrow(IllegalAttemptTransitionError);
  });
});
