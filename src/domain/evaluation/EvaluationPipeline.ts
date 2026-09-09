import type { CriterionKey, EvaluatorTag } from '../ids';
import type { Problem } from '../Problem';
import type { Rubric } from '../rubric/Rubric';
import type { SubmissionContent } from '../content/SubmissionContent';
import type { CriterionResult } from './CriterionResult';
import type { EvaluationOutcome, EvaluatorFailure } from './Evaluation';
import type { Evaluator, EvaluatorOutput } from '../ports/Evaluator';
import { criterionKeysFor } from '../rubric/Rubric';
import { DuplicateCriterionResultError } from '../errors';

export interface PipelineRunResult {
  readonly outcome: EvaluationOutcome;
  readonly outputs: readonly EvaluatorOutput[];
  readonly failures: readonly EvaluatorFailure[];
}

/** Below this many scored criteria an aggregate is false precision, not a score. */

/**
 * Domain service. Runs the configured evaluators over one submission and returns
 * the raw material for one Evaluation.
 *
 * There is no merge policy here, and that is deliberate: each criterion is owned by
 * exactly one evaluator via `Criterion.assessedBy`, coverage is asserted disjoint
 * and total before anything runs, and assembling results is a concatenation.
 *
 * It performs no I/O of its own — it awaits promises returned by a port — which is
 * why a "pipeline" lives in the domain without importing anything.
 */
export class EvaluationPipeline {
  private readonly evaluators: readonly Evaluator[];

  /** Order affects output determinism only; it carries no precedence meaning. */
  constructor(evaluators: readonly Evaluator[]) {
    this.evaluators = evaluators;
  }

  /**
   * Fails fast, before any evaluator runs, if two evaluators claim the same
   * criterion or if a rubric criterion is claimed by none. Coverage must be
   * disjoint and total. This is what removes the need for a merge policy.
   *
   * An evaluator whose tag owns no criterion in this rubric is legal and is simply
   * not called — that is how a rubric turns an evaluator off without a deploy.
   */
  assertCoverage(rubric: Rubric): void {
    const owner = new Map<CriterionKey, EvaluatorTag>();

    for (const evaluator of this.evaluators) {
      for (const key of criterionKeysFor(rubric, evaluator.tag)) {
        const existing = owner.get(key);
        if (existing !== undefined) {
          throw new DuplicateCriterionResultError(key, [existing, evaluator.tag]);
        }
        owner.set(key, evaluator.tag);
      }
    }

    const orphans = rubric.criteria
      .filter((criterion) => !owner.has(criterion.key))
      .map((criterion) => `${criterion.key} (assessedBy: ${criterion.assessedBy})`);

    if (orphans.length > 0) {
      throw new Error(
        `Rubric ${rubric.id} v${rubric.version} has criteria no configured evaluator claims: ` +
          `${orphans.join(', ')}. Configured tags: ` +
          `${this.evaluators.map((e) => e.tag).join(', ') || '(none)'}.`,
      );
    }
  }

  /**
   * Runs each evaluator over the criteria its tag owns. A rejection is captured as
   * an EvaluatorFailure and does not discard results already collected.
   * Outcome is COMPLETE only when there were no failures.
   *
   * Sequential on purpose: a later step can be handed an earlier step's facts
   * without a domain change. Parallelising is a one-line change here and nowhere else.
   */
  async run(args: {
    problem: Problem;
    rubric: Rubric;
    content: SubmissionContent;
  }): Promise<PipelineRunResult> {
    const { problem, rubric, content } = args;

    this.assertCoverage(rubric);

    const outputs: EvaluatorOutput[] = [];
    const failures: EvaluatorFailure[] = [];

    for (const evaluator of this.evaluators) {
      const criterionKeys = criterionKeysFor(rubric, evaluator.tag);
      if (criterionKeys.length === 0) {
        continue;
      }

      try {
        const raw = await evaluator.evaluate({ problem, rubric, criterionKeys, content });
        const { results, missing } = reconcile(raw.results, criterionKeys);

        if (results.length > 0) {
          outputs.push({ tag: evaluator.tag, adapter: raw.adapter || evaluator.adapter, results });
        }

        if (missing.length > 0) {
          // A dropped criterion degrades the run; it never discards what did arrive.
          failures.push({
            tag: evaluator.tag,
            adapter: evaluator.adapter,
            reason: `returned no result for: ${missing.join(', ')}`,
          });
        }
      } catch (error) {
        failures.push({
          tag: evaluator.tag,
          adapter: evaluator.adapter,
          reason: describe(error),
        });
      }
    }

    return { outcome: deriveOutcome(outputs, failures), outputs, failures };
  }
}

/**
 * Keeps exactly the requested keys, first result wins, and reports which requested
 * keys never arrived. Results for criteria this evaluator does not own are dropped
 * rather than allowed to collide with the owning evaluator downstream.
 */
function reconcile(
  results: readonly CriterionResult[],
  requested: readonly CriterionKey[],
): { results: readonly CriterionResult[]; missing: readonly CriterionKey[] } {
  const wanted = new Set(requested);
  const seen = new Set<CriterionKey>();
  const kept: CriterionResult[] = [];

  for (const result of results) {
    if (!wanted.has(result.criterionKey) || seen.has(result.criterionKey)) {
      continue;
    }
    seen.add(result.criterionKey);
    kept.push(result);
  }

  return { results: kept, missing: requested.filter((key) => !seen.has(key)) };
}

function deriveOutcome(
  outputs: readonly EvaluatorOutput[],
  failures: readonly EvaluatorFailure[],
): EvaluationOutcome {
  if (failures.length === 0) {
    return 'COMPLETE';
  }

  // An evaluator FAILURE and an UNASSESSABLE SUBMISSION are different facts and the
  // learner must not see them conflated. A Gemini timeout on a perfectly good design
  // is PARTIAL: some criteria are missing because the model was down, not because the
  // design could not be judged. NOT_EVALUABLE is reserved for the submission itself
  // being unassessable, which is decided before any evaluator runs.
  return 'PARTIAL';
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}
