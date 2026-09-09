/**
 * Seed data. Pure data plus one validation helper — no `mongodb`, no `next`, no I/O.
 * The Mongo writer that consumes this lives in
 * `src/infrastructure/mongo/seedDatabase.ts`, because only infrastructure may know
 * a database exists.
 */

import { assertRubricIsWellFormed } from '../domain/rubric/Rubric';
import { SEED_PROBLEMS } from './problems';
import { SEED_RUBRICS } from './rubric';

export {
  MVP_RUBRIC,
  MVP_RUBRIC_ID,
  MVP_RUBRIC_VERSION,
  MVP_RUBRIC_CRITERIA,
  SEED_RUBRICS,
  REQUIREMENTS_AND_ASSUMPTIONS,
  RESPONSIBILITIES_AND_DECOMPOSITION,
  COUPLING_AND_COHESION,
  ABSTRACTION_AND_INTERFACES,
  EXTENSIBILITY,
} from './rubric';

export {
  SEED_PROBLEMS,
  PARKING_LOT,
  ELEVATOR,
  VENDING_MACHINE,
  RATE_LIMITER,
} from './problems';

/**
 * Fails loudly at startup rather than quietly at scoring time. `Criterion` being data
 * is what makes rubric changes cheap; this is the price of that choice, and it is the
 * right price — a malformed rubric is caught before a learner ever sees a score.
 */
export function assertSeedDataIsWellFormed(): void {
  for (const rubric of SEED_RUBRICS) {
    assertRubricIsWellFormed(rubric);
  }

  const rubricKeys = new Set(SEED_RUBRICS.map((rubric) => rubric.id));
  const seenProblemIds = new Set<string>();
  const seenSlugs = new Set<string>();

  for (const problem of SEED_PROBLEMS) {
    if (seenProblemIds.has(problem.id)) {
      throw new Error(`Duplicate seeded problem id: ${problem.id}`);
    }
    if (seenSlugs.has(problem.slug)) {
      throw new Error(`Duplicate seeded problem slug: ${problem.slug}`);
    }
    if (!rubricKeys.has(problem.rubricId)) {
      throw new Error(
        `Problem ${problem.id} references unseeded rubric ${problem.rubricId}`,
      );
    }
    if (problem.requirements.length === 0) {
      throw new Error(
        `Problem ${problem.id} has no enumerated requirements, so "did the design ` +
          `address requirement N?" would be unanswerable`,
      );
    }
    seenProblemIds.add(problem.id);
    seenSlugs.add(problem.slug);
  }
}
