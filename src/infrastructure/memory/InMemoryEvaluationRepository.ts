import type { AttemptId, EvaluationId } from '../../domain/ids';
import type { Evaluation } from '../../domain/evaluation/Evaluation';
import type { EvaluationRepository } from '../../domain/ports/EvaluationRepository';

/**
 * Append-only, like the real one: a re-run adds runNumber n+1 and never overwrites
 * run n, so a degraded first run stays auditable next to the successful second.
 */
export class InMemoryEvaluationRepository implements EvaluationRepository {
  private readonly runs: Evaluation[] = [];

  constructor(seed: readonly Evaluation[] = []) {
    this.runs.push(...seed);
  }

  async save(evaluation: Evaluation): Promise<void> {
    assertEvidencePresent(evaluation);
    const existing = this.runs.findIndex((run) => run.id === evaluation.id);
    if (existing >= 0) {
      this.runs[existing] = evaluation;
      return;
    }
    this.runs.push(evaluation);
  }

  async findById(id: EvaluationId): Promise<Evaluation | null> {
    return this.runs.find((run) => run.id === id) ?? null;
  }

  async findLatestByAttemptId(attemptId: AttemptId): Promise<Evaluation | null> {
    let latest: Evaluation | null = null;
    for (const run of this.runs) {
      if (run.attemptId !== attemptId) continue;
      if (latest === null || run.runNumber >= latest.runNumber) latest = run;
    }
    return latest;
  }

  async latestForAttempts(
    attemptIds: readonly AttemptId[],
  ): Promise<readonly Evaluation[]> {
    const wanted = new Set(attemptIds);
    const latest = new Map<AttemptId, Evaluation>();

    for (const run of this.runs) {
      if (!wanted.has(run.attemptId)) continue;
      const held = latest.get(run.attemptId);
      if (!held || run.runNumber >= held.runNumber) latest.set(run.attemptId, run);
    }

    return [...latest.values()];
  }

  async countRunsForAttempt(attemptId: AttemptId): Promise<number> {
    return this.runs.filter((run) => run.attemptId === attemptId).length;
  }

  // --- test affordances, not part of the port -------------------------------

  /** Every run for the attempt, ascending by runNumber. */
  findAllByAttemptId(attemptId: AttemptId): readonly Evaluation[] {
    return this.runs
      .filter((run) => run.attemptId === attemptId)
      .sort((a, b) => a.runNumber - b.runNumber);
  }

  clear(): void {
    this.runs.length = 0;
  }
}

/**
 * The same guard the Mongo adapter applies. "No score without evidence" is only true
 * if it is also true on the way to storage — a result that loses its evidence in
 * transit is exactly the unevidenced score the product exists to prevent.
 */
function assertEvidencePresent(evaluation: Evaluation): void {
  for (const result of evaluation.results) {
    if (!result.evidence || result.evidence.trim().length === 0) {
      throw new Error(
        `Refusing to store evaluation ${evaluation.id}: result for ` +
          `'${result.criterionKey}' has no evidence`,
      );
    }
  }
}
