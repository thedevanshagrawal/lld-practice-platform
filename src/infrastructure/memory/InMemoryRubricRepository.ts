import type { Rubric } from '../../domain/rubric/Rubric';
import type { RubricId } from '../../domain/ids';
import type { RubricRepository } from '../../domain/ports/RubricRepository';

/**
 * Holds every version of every rubric, because an old Evaluation must still be
 * renderable against the ruler it was scored with.
 */
export class InMemoryRubricRepository implements RubricRepository {
  private readonly versions = new Map<string, Rubric>();

  constructor(rubrics: readonly Rubric[] = []) {
    for (const rubric of rubrics) {
      this.versions.set(key(rubric.id, rubric.version), rubric);
    }
  }

  async findById(id: RubricId, version?: number): Promise<Rubric | null> {
    if (version !== undefined) {
      return this.versions.get(key(id, version)) ?? null;
    }

    let current: Rubric | null = null;
    for (const rubric of this.versions.values()) {
      if (rubric.id === id && (current === null || rubric.version > current.version)) {
        current = rubric;
      }
    }
    return current;
  }
}

function key(id: RubricId, version: number): string {
  return `${id}@${version}`;
}
