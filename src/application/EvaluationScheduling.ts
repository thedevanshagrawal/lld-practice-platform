import type { AttemptId } from '../domain/ids';
import type { EvaluationScheduler } from './SubmitAttempt';
import type { RunEvaluation } from './RunEvaluation';

/**
 * The fire-and-forget seam from the sequence diagram, in one place.
 *
 * In-process and not awaited, per ADR-3: the AttemptStatus field is the job record,
 * so there is no queue. The honest cost is that a process restart mid-run strands
 * the attempt in EVALUATING — which is precisely why `AttemptRepository.findStale`
 * exists and why FAILED -> EVALUATING is legal.
 *
 * Swapping this for a real queue later replaces this function and nothing else: the
 * pipeline's inputs are a Problem, a Rubric and a SubmissionContent, all reachable
 * by id.
 */
export function createInlineEvaluationScheduler(
  run: RunEvaluation,
  onError?: (attemptId: AttemptId, error: unknown) => void,
): EvaluationScheduler {
  return (attemptId: AttemptId): void => {
    void run.execute({ attemptId }).catch((error: unknown) => {
      // Never rethrow: this promise has no owner, and an unhandled rejection here
      // would take down the process that just accepted the learner's work.
      onError?.(attemptId, error);
    });
  };
}
