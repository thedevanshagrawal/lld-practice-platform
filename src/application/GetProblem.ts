import type { Problem } from '../domain/Problem';
import type { Rubric } from '../domain/rubric/Rubric';
import type { ProblemRepository } from '../domain/ports/ProblemRepository';
import type { RubricRepository } from '../domain/ports/RubricRepository';
import { ProblemNotFoundError, RubricNotFoundError } from './errors';

export interface GetProblemDeps {
  readonly problems: ProblemRepository;
  readonly rubrics: RubricRepository;
}

export interface GetProblemInput {
  /** An id or a slug. The UI routes on slug; the API stores ids. */
  readonly problemRef: string;
}

export interface GetProblemResult {
  readonly problem: Problem;
  /** Returned alongside so the problem page can show what it will be judged on. */
  readonly rubric: Rubric;
}

export class GetProblem {
  private readonly problems: ProblemRepository;
  private readonly rubrics: RubricRepository;

  constructor(deps: GetProblemDeps) {
    this.problems = deps.problems;
    this.rubrics = deps.rubrics;
  }

  async execute(input: GetProblemInput): Promise<GetProblemResult> {
    const problem =
      (await this.problems.findById(input.problemRef)) ??
      (await this.problems.findBySlug(input.problemRef));

    if (!problem) {
      throw new ProblemNotFoundError(input.problemRef);
    }

    const rubric = await this.rubrics.findById(problem.rubricId);
    if (!rubric) {
      throw new RubricNotFoundError(problem.rubricId);
    }

    return { problem, rubric };
  }
}
