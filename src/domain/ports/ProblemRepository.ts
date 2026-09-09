import type { Problem } from '../Problem';
import type { ProblemId } from '../ids';

export interface ProblemRepository {
  findById(id: ProblemId): Promise<Problem | null>;
  findBySlug(slug: string): Promise<Problem | null>;
  list(): Promise<readonly Problem[]>;
}
