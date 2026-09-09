import type { CriterionKey, EvaluatorTag, RubricId } from '../ids';
import type { Criterion } from './Criterion';

export interface Rubric {
  readonly id: RubricId;
  /** Incremented whenever criteria or weights change. Stored on every Evaluation. */
  readonly version: number;
  readonly name: string;
  readonly criteria: readonly Criterion[];
}

export function criterionByKey(rubric: Rubric, key: CriterionKey): Criterion | undefined {
  return rubric.criteria.find((c) => c.key === key);
}

export function criterionKeysFor(rubric: Rubric, tag: EvaluatorTag): readonly CriterionKey[] {
  return rubric.criteria.filter((c) => c.assessedBy === tag).map((c) => c.key);
}

const WEIGHT_EPSILON = 0.001;

/** Throws if weights do not sum to 1 (within epsilon) or keys are not unique. */
export function assertRubricIsWellFormed(rubric: Rubric): void {
  const keys = new Set<string>();
  let totalWeight = 0;

  for (const criterion of rubric.criteria) {
    if (keys.has(criterion.key)) {
      throw new Error(`Duplicate criterion key: ${criterion.key} in rubric ${rubric.id}`);
    }
    keys.add(criterion.key);
    totalWeight += criterion.weight;
  }

  if (Math.abs(totalWeight - 1.0) > WEIGHT_EPSILON) {
    throw new Error(
      `Criterion weights sum to ${totalWeight}, expected 1.0 (±${WEIGHT_EPSILON}) in rubric ${rubric.id}`,
    );
  }
}
