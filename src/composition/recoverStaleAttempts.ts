import type { Attempt } from '@/domain/attempt/Attempt';
import { getContainer } from './container';

/**
 * The backstop for the Vercel async problem.
 *
 * The primary trigger for evaluation is the browser posting to
 * `/api/attempts/[id]/evaluate` right after submit. That covers the normal case. This
 * covers the abnormal ones: the tab closed before the post landed, the connection
 * dropped mid-evaluation, or the serverless function was frozen or recycled while a run
 * was in flight.
 *
 * `AttemptStatus` is already the job record — there is no queue and no second source of
 * truth — so recovery is a query for attempts that have been in a non-terminal state too
 * long, which is exactly what `AttemptRepository.findStale` was put on the port for.
 *
 * WHY THIS LIVES IN src/composition RATHER THAN src/application:
 * it is a scheduled operational sweep, not a learner-facing use case, and it is the only
 * caller of the FAILED transition for a non-evaluator reason. Written as a use case it
 * would be `RecoverStaleAttempts` in the application layer with the same four lines; if
 * a second trigger ever needs it, that is the promotion to make.
 */

/** SUBMITTED for longer than this means nobody ever asked for an evaluation. */
const SUBMITTED_STALE_MS = 2 * 60_000;

/**
 * EVALUATING for longer than this means a run started and never finished. It must be
 * comfortably longer than the evaluator's own 60 s budget, or the sweep would kill
 * healthy in-flight runs.
 */
const EVALUATING_STALE_MS = 5 * 60_000;

/** A cron tick must not run 200 Gemini calls. Stragglers wait for the next tick. */
const MAX_PER_SWEEP = 5;

export interface RecoveryOutcome {
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly previousStatus: string;
  readonly status: string | null;
  readonly outcome: string | null;
  readonly error: string | null;
}

export interface RecoverySummary {
  readonly checkedAt: string;
  readonly staleSubmitted: number;
  readonly staleEvaluating: number;
  readonly recovered: readonly RecoveryOutcome[];
}

export async function recoverStaleAttempts(now: Date = new Date()): Promise<RecoverySummary> {
  const container = await getContainer();

  const [submitted, evaluating] = await Promise.all([
    container.attempts.findStale('SUBMITTED', new Date(now.getTime() - SUBMITTED_STALE_MS)),
    container.attempts.findStale('EVALUATING', new Date(now.getTime() - EVALUATING_STALE_MS)),
  ]);

  const queue: Attempt[] = [...submitted, ...evaluating].slice(0, MAX_PER_SWEEP);
  const recovered: RecoveryOutcome[] = [];

  for (const attempt of queue) {
    const previousStatus = attempt.status;
    try {
      if (previousStatus === 'EVALUATING') {
        // EVALUATING -> EVALUATING is not a legal transition, and correctly so: it is
        // the lock that stops two concurrent runs. To re-run a stranded attempt the lock
        // has to be released first, which the domain already models as
        // EVALUATING -> FAILED -> EVALUATING. No new transition is invented here.
        attempt.failEvaluation(
          'Evaluation was interrupted before it finished (process frozen or restarted). ' +
            'Recovered by the scheduled sweep.',
          attempt.latestEvaluationId,
        );
        await container.attempts.save(attempt);
      }

      const result = await container.runEvaluation.execute({ attemptId: attempt.id });
      recovered.push({
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        previousStatus,
        status: result.status,
        outcome: result.outcome,
        error: null,
      });
    } catch (error) {
      // One bad attempt must not stop the sweep. It will be stale again next tick.
      recovered.push({
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        previousStatus,
        status: null,
        outcome: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    checkedAt: now.toISOString(),
    staleSubmitted: submitted.length,
    staleEvaluating: evaluating.length,
    recovered,
  };
}
