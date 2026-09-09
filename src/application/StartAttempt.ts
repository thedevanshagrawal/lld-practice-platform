import type { AttemptId, LearnerId, ProblemId } from '../domain/ids';
import type { AttemptStatus } from '../domain/attempt/AttemptStatus';
import type { AttemptRepository } from '../domain/ports/AttemptRepository';
import type { ProblemRepository } from '../domain/ports/ProblemRepository';
import type { IdGenerator } from '../domain/ports/IdGenerator';
import type { Now } from '../domain/ports/Clock';
import { Attempt } from '../domain/attempt/Attempt';
import { ProblemNotFoundError } from './errors';

export interface StartAttemptDeps {
  readonly attempts: AttemptRepository;
  readonly problems: ProblemRepository;
  readonly ids: IdGenerator;
  readonly now: Now;
}

export interface StartAttemptInput {
  readonly learnerId: LearnerId;
  readonly problemId: ProblemId;
}

export interface StartAttemptResult {
  readonly attemptId: AttemptId;
  readonly attemptNumber: number;
  readonly status: AttemptStatus;
  readonly createdAt: Date;
}

/**
 * Creates a DRAFT attempt. A revised design is a NEW attempt, never a second
 * submission on an old one — that is what makes attempt 1 -> 2 -> 3 a comparable
 * sequence for the history view.
 *
 * `attemptNumber` is derived from the count of existing attempts, so it is 1-based
 * per learner per problem and monotonic without a counter document.
 */
export class StartAttempt {
  private readonly attempts: AttemptRepository;
  private readonly problems: ProblemRepository;
  private readonly ids: IdGenerator;
  private readonly now: Now;

  constructor(deps: StartAttemptDeps) {
    this.attempts = deps.attempts;
    this.problems = deps.problems;
    this.ids = deps.ids;
    this.now = deps.now;
  }

  async execute(input: StartAttemptInput): Promise<StartAttemptResult> {
    const problem = await this.problems.findById(input.problemId);
    if (!problem) {
      throw new ProblemNotFoundError(input.problemId);
    }

    const priorAttempts = await this.attempts.countByLearnerAndProblem(
      input.learnerId,
      problem.id,
    );

    const attempt = Attempt.start({
      id: this.ids.next(),
      learnerId: input.learnerId,
      problemId: problem.id,
      attemptNumber: priorAttempts + 1,
      createdAt: this.now(),
    });

    await this.attempts.save(attempt);

    return {
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      createdAt: attempt.createdAt,
    };
  }
}
