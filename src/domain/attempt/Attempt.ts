import type { AttemptId, EvaluationId, LearnerId, ProblemId } from '../ids';
import type { Submission } from './Submission';
import type { AttemptStatus } from './AttemptStatus';
import { isLegalTransition } from './AttemptStatus';
import { IllegalAttemptTransitionError } from '../errors';

/** Flat, serialisable snapshot. The persistence mapper sees only this. */
export interface AttemptState {
  readonly id: AttemptId;
  readonly learnerId: LearnerId;
  readonly problemId: ProblemId;
  /** 1-based, per learner per problem. Drives history ordering. */
  readonly attemptNumber: number;
  readonly status: AttemptStatus;
  readonly createdAt: Date;
  readonly submission: Submission | null;
  readonly latestEvaluationId: EvaluationId | null;
  readonly failureReason: string | null;
}

export class Attempt {
  private _state: AttemptState;

  private constructor(state: AttemptState) {
    this._state = state;
  }

  static start(args: {
    id: AttemptId;
    learnerId: LearnerId;
    problemId: ProblemId;
    attemptNumber: number;
    createdAt: Date;
  }): Attempt {
    return new Attempt({
      id: args.id,
      learnerId: args.learnerId,
      problemId: args.problemId,
      attemptNumber: args.attemptNumber,
      status: 'DRAFT',
      createdAt: args.createdAt,
      submission: null,
      latestEvaluationId: null,
      failureReason: null,
    });
  }

  static rehydrate(state: AttemptState): Attempt {
    return new Attempt(state);
  }

  get id(): AttemptId { return this._state.id; }
  get learnerId(): LearnerId { return this._state.learnerId; }
  get problemId(): ProblemId { return this._state.problemId; }
  get attemptNumber(): number { return this._state.attemptNumber; }
  get status(): AttemptStatus { return this._state.status; }
  get createdAt(): Date { return this._state.createdAt; }
  get submission(): Submission | null { return this._state.submission; }
  get latestEvaluationId(): EvaluationId | null { return this._state.latestEvaluationId; }
  get failureReason(): string | null { return this._state.failureReason; }

  /** DRAFT -> SUBMITTED. Attaches the submission. Throws IllegalAttemptTransitionError. */
  submit(submission: Submission): void {
    this.transitionTo('SUBMITTED');
    this._state = { ...this._state, submission, status: 'SUBMITTED' };
  }

  /** SUBMITTED | FAILED -> EVALUATING. Clears any previous failure reason. */
  beginEvaluation(): void {
    this.transitionTo('EVALUATING');
    this._state = { ...this._state, status: 'EVALUATING', failureReason: null };
  }

  /** EVALUATING -> COMPLETED. Records the evaluation that produced the verdict. */
  completeEvaluation(evaluationId: EvaluationId): void {
    this.transitionTo('COMPLETED');
    this._state = { ...this._state, status: 'COMPLETED', latestEvaluationId: evaluationId };
  }

  /**
   * EVALUATING -> FAILED. Keeps the partial evaluation id when one was produced,
   * so deterministic feedback is still shown for a failed run.
   */
  failEvaluation(reason: string, partialEvaluationId: EvaluationId | null): void {
    this.transitionTo('FAILED');
    this._state = {
      ...this._state,
      status: 'FAILED',
      failureReason: reason,
      latestEvaluationId: partialEvaluationId ?? this._state.latestEvaluationId,
    };
  }

  canTransitionTo(next: AttemptStatus): boolean {
    return isLegalTransition(this._state.status, next);
  }

  toState(): AttemptState {
    return { ...this._state };
  }

  private transitionTo(next: AttemptStatus): void {
    if (!isLegalTransition(this._state.status, next)) {
      throw new IllegalAttemptTransitionError(this._state.status, next, this._state.id);
    }
  }
}
