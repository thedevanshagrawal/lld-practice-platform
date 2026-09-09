import type { Rubric } from '../rubric/Rubric';
import type { RubricId } from '../ids';

export interface RubricRepository {
  /**
   * `version` omitted -> the current version. Historical evaluations pin their own
   * version, so an old Evaluation can always be re-rendered against the ruler it
   * was actually scored with.
   */
  findById(id: RubricId, version?: number): Promise<Rubric | null>;
}
