import type { AttemptId, SubmissionId } from '../ids';
import type { SubmissionContent } from '../content/SubmissionContent';

export interface Submission {
  readonly id: SubmissionId;
  readonly attemptId: AttemptId;
  readonly content: SubmissionContent;
  readonly submittedAt: Date;
  /**
   * Client-supplied. A repeated submit with the same key must resolve to the
   * attempt already created, never to a second one.
   */
  readonly idempotencyKey: string;
}
