import type { AttemptId, SubmissionId } from '../domain/ids';
import type { AttemptStatus } from '../domain/attempt/AttemptStatus';
import type { SubmissionContent } from '../domain/content/SubmissionContent';
import type { Submission } from '../domain/attempt/Submission';
import type { AttemptRepository } from '../domain/ports/AttemptRepository';
import type { IdGenerator } from '../domain/ports/IdGenerator';
import type { Now } from '../domain/ports/Clock';
import { InvalidSubmissionError, AttemptNotFoundError } from './errors';

/**
 * How the write path hands evaluation off. Synchronous and void-returning on
 * purpose: a use case that could `await` this would eventually be made to, and the
 * learner's submit would start paying for a Gemini call.
 *
 * The composition root wires this to `void runEvaluation.execute({ attemptId })`.
 */
export type EvaluationScheduler = (attemptId: AttemptId) => void;

export interface SubmitAttemptDeps {
  readonly attempts: AttemptRepository;
  readonly ids: IdGenerator;
  readonly now: Now;
  /** Omit it and submission still works; the attempt simply waits in SUBMITTED. */
  readonly scheduleEvaluation?: EvaluationScheduler;
}

export interface SubmitAttemptInput {
  readonly attemptId: AttemptId;
  readonly content: SubmissionContent;
  /** Client-supplied. The same key twice is exactly one submission. */
  readonly idempotencyKey: string;
}

export interface SubmitAttemptResult {
  readonly attemptId: AttemptId;
  readonly submissionId: SubmissionId;
  readonly status: AttemptStatus;
  readonly submittedAt: Date;
  /** True when this call resolved to a submission that already existed. */
  readonly duplicate: boolean;
}

/**
 * The learner's write path. Three properties, in this order, are the whole point:
 *
 *  1. IDEMPOTENT — the same key twice yields one Submission and one status change.
 *  2. STORE BEFORE EVALUATE — `attempts.save()` completes before anything is
 *     scheduled. A submission is never lost to an evaluator failure because the
 *     evaluator has not been reached yet.
 *  3. RETURNS IMMEDIATELY — evaluation is handed to a scheduler, never awaited.
 *     Nothing on this path can touch the network.
 */
export class SubmitAttempt {
  private readonly attempts: AttemptRepository;
  private readonly ids: IdGenerator;
  private readonly now: Now;
  private readonly scheduleEvaluation?: EvaluationScheduler;

  constructor(deps: SubmitAttemptDeps) {
    this.attempts = deps.attempts;
    this.ids = deps.ids;
    this.now = deps.now;
    this.scheduleEvaluation = deps.scheduleEvaluation;
  }

  async execute(input: SubmitAttemptInput): Promise<SubmitAttemptResult> {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new InvalidSubmissionError('idempotencyKey', 'must be a non-empty string');
    }

    const attempt = await this.attempts.findById(input.attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(input.attemptId);
    }

    // 1. Idempotency, before anything is written.
    const existing = await this.attempts.findByIdempotencyKey(
      attempt.learnerId,
      idempotencyKey,
    );
    if (existing?.submission) {
      return {
        attemptId: existing.id,
        submissionId: existing.submission.id,
        status: existing.status,
        submittedAt: existing.submission.submittedAt,
        duplicate: true,
      };
    }

    const submission: Submission = {
      id: this.ids.next(),
      attemptId: attempt.id,
      content: input.content,
      submittedAt: this.now(),
      idempotencyKey,
    };

    // 2. DRAFT -> SUBMITTED. A second submit on a non-DRAFT attempt throws here;
    //    the idempotency lookup above is the first line of defence, this is the second.
    attempt.submit(submission);

    // 3. STORE BEFORE EVALUATING. Attempt and submission, one write.
    await this.attempts.save(attempt);

    // 4. Hand off. Never awaited, and a broken scheduler must not fail a submission
    //    that is already safely persisted — the attempt just stays in SUBMITTED and
    //    the recovery sweep (findStale) picks it up.
    try {
      this.scheduleEvaluation?.(attempt.id);
    } catch {
      // Intentionally swallowed. The submission is stored; that is the guarantee.
    }

    return {
      attemptId: attempt.id,
      submissionId: submission.id,
      status: attempt.status,
      submittedAt: submission.submittedAt,
      duplicate: false,
    };
  }
}
