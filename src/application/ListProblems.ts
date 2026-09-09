import type { Problem } from '../domain/Problem';
import type { ProblemRepository } from '../domain/ports/ProblemRepository';

export interface ListProblemsDeps {
  readonly problems: ProblemRepository;
}

/**
 * Deliberately thin. It exists so the route handler depends on a use case rather
 * than on a repository, which is what keeps the seam intact when problems stop
 * being a seeded list.
 */
export class ListProblems {
  private readonly problems: ProblemRepository;

  constructor(deps: ListProblemsDeps) {
    this.problems = deps.problems;
  }

  async execute(): Promise<readonly Problem[]> {
    return this.problems.list();
  }
}
