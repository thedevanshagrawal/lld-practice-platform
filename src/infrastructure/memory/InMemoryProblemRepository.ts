import type { Problem } from '../../domain/Problem';
import type { ProblemId } from '../../domain/ids';
import type { ProblemRepository } from '../../domain/ports/ProblemRepository';

/** Problems are seeded configuration, so the in-memory adapter is the honest one. */
export class InMemoryProblemRepository implements ProblemRepository {
  private readonly byId = new Map<ProblemId, Problem>();

  constructor(problems: readonly Problem[] = []) {
    for (const problem of problems) {
      this.byId.set(problem.id, problem);
    }
  }

  async findById(id: ProblemId): Promise<Problem | null> {
    return this.byId.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<Problem | null> {
    for (const problem of this.byId.values()) {
      if (problem.slug === slug) return problem;
    }
    return null;
  }

  async list(): Promise<readonly Problem[]> {
    return [...this.byId.values()];
  }
}
