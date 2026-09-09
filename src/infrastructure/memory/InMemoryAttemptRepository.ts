import type { AttemptId, LearnerId, ProblemId, SubmissionId } from '../../domain/ids';
import type { AttemptState } from '../../domain/attempt/Attempt';
import type { AttemptStatus } from '../../domain/attempt/AttemptStatus';
import type { AttemptRepository } from '../../domain/ports/AttemptRepository';
import { Attempt } from '../../domain/attempt/Attempt';

/**
 * The reference adapter, and the one the tests use.
 *
 * Two things it does on purpose that a naive fake would not:
 *
 *  1. It stores flat AttemptState snapshots and rehydrates a fresh aggregate on
 *     every read. Handing back the same object instance would let a test pass
 *     because two variables aliased the same mutable Attempt — a bug the Mongo
 *     adapter could never reproduce.
 *  2. It enforces the (learnerId, idempotencyKey) uniqueness that the Mongo index
 *     enforces. A fake that is more permissive than production hides exactly the
 *     class of bug it was written to catch.
 */
export class InMemoryAttemptRepository implements AttemptRepository {
  private readonly states = new Map<AttemptId, AttemptState>();

  /** Every save, in order. `[{ attemptId, status }]` — the call log tests assert on. */
  readonly saves: { attemptId: AttemptId; status: AttemptStatus; at: Date }[] = [];

  constructor(seed: readonly Attempt[] = []) {
    for (const attempt of seed) {
      this.states.set(attempt.id, attempt.toState());
    }
  }

  async findById(id: AttemptId): Promise<Attempt | null> {
    const state = this.states.get(id);
    return state ? Attempt.rehydrate(clone(state)) : null;
  }

  async findByIdempotencyKey(
    learnerId: LearnerId,
    idempotencyKey: string,
  ): Promise<Attempt | null> {
    for (const state of this.states.values()) {
      if (
        state.learnerId === learnerId &&
        state.submission?.idempotencyKey === idempotencyKey
      ) {
        return Attempt.rehydrate(clone(state));
      }
    }
    return null;
  }

  async listByLearnerAndProblem(
    learnerId: LearnerId,
    problemId: ProblemId,
  ): Promise<readonly Attempt[]> {
    return [...this.states.values()]
      .filter((state) => state.learnerId === learnerId && state.problemId === problemId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber)
      .map((state) => Attempt.rehydrate(clone(state)));
  }

  async countByLearnerAndProblem(
    learnerId: LearnerId,
    problemId: ProblemId,
  ): Promise<number> {
    let count = 0;
    for (const state of this.states.values()) {
      if (state.learnerId === learnerId && state.problemId === problemId) count += 1;
    }
    return count;
  }

  async save(attempt: Attempt): Promise<void> {
    const state = attempt.toState();
    const key = state.submission?.idempotencyKey;

    if (key !== undefined) {
      for (const other of this.states.values()) {
        if (
          other.id !== state.id &&
          other.learnerId === state.learnerId &&
          other.submission?.idempotencyKey === key
        ) {
          throw new Error(
            `Duplicate idempotency key '${key}' for learner '${state.learnerId}' ` +
              `(already used by attempt '${other.id}')`,
          );
        }
      }
    }

    this.states.set(state.id, clone(state));
    this.saves.push({ attemptId: state.id, status: state.status, at: new Date() });
  }

  async findStale(status: AttemptStatus, olderThan: Date): Promise<readonly Attempt[]> {
    return [...this.states.values()]
      .filter((state) => {
        if (state.status !== status) return false;
        const since = state.submission?.submittedAt ?? state.createdAt;
        return since.getTime() < olderThan.getTime();
      })
      .map((state) => Attempt.rehydrate(clone(state)));
  }

  // --- test affordances, not part of the port -------------------------------

  /** Statuses this attempt was persisted in, in order. Proves "exactly one transition". */
  statusChangesFor(attemptId: AttemptId): readonly AttemptStatus[] {
    return this.saves.filter((s) => s.attemptId === attemptId).map((s) => s.status);
  }

  /** Distinct submission ids ever persisted for the attempt. Length 1 or 0, always. */
  submissionsFor(attemptId: AttemptId): readonly SubmissionId[] {
    const submission = this.states.get(attemptId)?.submission;
    return submission ? [submission.id] : [];
  }

  clear(): void {
    this.states.clear();
    this.saves.length = 0;
  }
}

/**
 * Shallow-clones the mutable spine of the state. `submission.content` is passed by
 * reference on purpose: SubmissionContent is immutable by contract, and cloning it
 * would mean this fake had to know the concrete class — the exact coupling the
 * format seam exists to prevent.
 */
function clone(state: AttemptState): AttemptState {
  return {
    ...state,
    createdAt: new Date(state.createdAt.getTime()),
    submission: state.submission
      ? {
          ...state.submission,
          submittedAt: new Date(state.submission.submittedAt.getTime()),
        }
      : null,
  };
}
