import type { Problem } from '../../domain/Problem';
import type { Rubric } from '../../domain/rubric/Rubric';
import type { Criterion, Score } from '../../domain/rubric/Criterion';
import type { Attempt as AttemptType } from '../../domain/attempt/Attempt';
import type { AttemptStatus } from '../../domain/attempt/AttemptStatus';
import type { Evaluation, EvaluationOutcome } from '../../domain/evaluation/Evaluation';
import type { CriterionResult } from '../../domain/evaluation/CriterionResult';
import type {
  AttemptDoc,
  CriterionResultDoc,
  EvaluationDoc,
  ProblemDoc,
  RubricDoc,
} from './documents';
import { Attempt } from '../../domain/attempt/Attempt';
import { ATTEMPT_STATUSES } from '../../domain/attempt/AttemptStatus';
import { createCriterionResult } from '../../domain/evaluation/CriterionResult';
import { SubmissionContentMapper } from './SubmissionContentMapper';

/**
 * Hand-written, field by field, in both directions.
 *
 * NOTHING here is written with a spread of a domain object. That is deliberate and it
 * is the guard against the serialisation bug this layer is most likely to have:
 *
 *  - `{ ...attempt }` on the aggregate stores an object with a private `_state` and
 *    no public fields, because the getters are on the prototype and are not enumerable;
 *  - `{ ...content }` on a TextDesignContent stores `{}` for the same reason, so the
 *    learner's whole submission silently becomes an empty document;
 *  - a projection or a partial map quietly drops `evidence` from a CriterionResult,
 *    and the platform starts showing scores with nothing behind them — the exact
 *    anti-pattern the product exists to prevent.
 *
 * The last one is checked, not just avoided: results are re-validated through
 * `createCriterionResult` on the way out of the database, so a result that lost its
 * evidence in transit throws at the domain boundary instead of rendering.
 */

// --- Problem ---------------------------------------------------------------

export function problemToDoc(problem: Problem): ProblemDoc {
  return {
    _id: problem.id,
    slug: problem.slug,
    title: problem.title,
    statement: problem.statement,
    requirements: [...problem.requirements],
    constraints: [...problem.constraints],
    rubricId: problem.rubricId,
  };
}

export function problemFromDoc(doc: ProblemDoc): Problem {
  return {
    id: doc._id,
    slug: doc.slug,
    title: doc.title,
    statement: doc.statement,
    requirements: doc.requirements ?? [],
    constraints: doc.constraints ?? [],
    rubricId: doc.rubricId,
  };
}

// --- Rubric ----------------------------------------------------------------

const SCORE_LEVELS: readonly Score[] = [0, 1, 2, 3, 4];

export function rubricDocId(rubricId: string, version: number): string {
  return `${rubricId}@${version}`;
}

export function rubricToDoc(rubric: Rubric): RubricDoc {
  return {
    _id: rubricDocId(rubric.id, rubric.version),
    rubricId: rubric.id,
    version: rubric.version,
    name: rubric.name,
    criteria: rubric.criteria.map((criterion) => ({
      key: criterion.key,
      label: criterion.label,
      weight: criterion.weight,
      guidance: criterion.guidance,
      anchors: Object.fromEntries(
        SCORE_LEVELS.map((level) => [String(level), criterion.anchors[level]]),
      ),
      assessedBy: criterion.assessedBy,
    })),
  };
}

export function rubricFromDoc(doc: RubricDoc): Rubric {
  const criteria: Criterion[] = (doc.criteria ?? []).map((criterionDoc) => {
    const anchors = {} as Record<Score, string>;
    for (const level of SCORE_LEVELS) {
      const anchor = criterionDoc.anchors?.[String(level)];
      if (typeof anchor !== 'string') {
        throw new Error(
          `Rubric ${doc.rubricId} v${doc.version}: criterion '${criterionDoc.key}' ` +
            `has no anchor for score ${level}. An unanchored band is an ungrounded score.`,
        );
      }
      anchors[level] = anchor;
    }

    return {
      key: criterionDoc.key,
      label: criterionDoc.label,
      weight: criterionDoc.weight,
      guidance: criterionDoc.guidance,
      anchors,
      assessedBy: criterionDoc.assessedBy,
    };
  });

  return {
    id: doc.rubricId,
    version: doc.version,
    name: doc.name,
    criteria,
  };
}

// --- Attempt ---------------------------------------------------------------

export function attemptToDoc(attempt: AttemptType): AttemptDoc {
  const state = attempt.toState();
  const submission = state.submission;

  return {
    _id: state.id,
    learnerId: state.learnerId,
    problemId: state.problemId,
    attemptNumber: state.attemptNumber,
    status: state.status,
    createdAt: state.createdAt,
    submission: submission
      ? {
          id: submission.id,
          attemptId: submission.attemptId,
          content: SubmissionContentMapper.toDocument(submission.content),
          submittedAt: submission.submittedAt,
          idempotencyKey: submission.idempotencyKey,
        }
      : null,
    latestEvaluationId: state.latestEvaluationId,
    failureReason: state.failureReason,
    activityAt: submission?.submittedAt ?? state.createdAt,
  };
}

export function attemptFromDoc(doc: AttemptDoc): AttemptType {
  return Attempt.rehydrate({
    id: doc._id,
    learnerId: doc.learnerId,
    problemId: doc.problemId,
    attemptNumber: doc.attemptNumber,
    status: toAttemptStatus(doc.status, doc._id),
    createdAt: doc.createdAt,
    submission: doc.submission
      ? {
          id: doc.submission.id,
          attemptId: doc.submission.attemptId,
          content: SubmissionContentMapper.fromDocument(doc.submission.content),
          submittedAt: doc.submission.submittedAt,
          idempotencyKey: doc.submission.idempotencyKey,
        }
      : null,
    latestEvaluationId: doc.latestEvaluationId ?? null,
    failureReason: doc.failureReason ?? null,
  });
}

function toAttemptStatus(value: string, attemptId: string): AttemptStatus {
  const status = ATTEMPT_STATUSES.find((candidate) => candidate === value);
  if (!status) {
    throw new Error(`Attempt ${attemptId} has unknown status '${value}'`);
  }
  return status;
}

// --- Evaluation ------------------------------------------------------------

export function evaluationToDoc(evaluation: Evaluation): EvaluationDoc {
  return {
    _id: evaluation.id,
    attemptId: evaluation.attemptId,
    rubricId: evaluation.rubricId,
    rubricVersion: evaluation.rubricVersion,
    runNumber: evaluation.runNumber,
    results: evaluation.results.map((result) =>
      criterionResultToDoc(result, evaluation.id),
    ),
    overall: {
      // Explicitly preserved: `null` means "nothing was assessed", which is not zero.
      weighted: evaluation.overall.weighted,
      assessedWeight: evaluation.overall.assessedWeight,
    },
    outcome: evaluation.outcome,
    contributions: evaluation.contributions.map((contribution) => ({
      tag: contribution.tag,
      adapter: contribution.adapter,
      criterionKeys: [...contribution.criterionKeys],
    })),
    failures: evaluation.failures.map((failure) => ({
      tag: failure.tag,
      adapter: failure.adapter,
      reason: failure.reason,
    })),
    createdAt: evaluation.createdAt,
  };
}

export function evaluationFromDoc(doc: EvaluationDoc): Evaluation {
  return {
    id: doc._id,
    attemptId: doc.attemptId,
    rubricId: doc.rubricId,
    rubricVersion: doc.rubricVersion,
    runNumber: doc.runNumber,
    results: (doc.results ?? []).map((result) => criterionResultFromDoc(result, doc._id)),
    overall: {
      weighted: doc.overall?.weighted ?? null,
      assessedWeight: doc.overall?.assessedWeight ?? 0,
    },
    outcome: doc.outcome as EvaluationOutcome,
    contributions: (doc.contributions ?? []).map((contribution) => ({
      tag: contribution.tag,
      adapter: contribution.adapter,
      criterionKeys: contribution.criterionKeys ?? [],
    })),
    failures: (doc.failures ?? []).map((failure) => ({
      tag: failure.tag,
      adapter: failure.adapter,
      reason: failure.reason,
    })),
    createdAt: doc.createdAt,
  };
}

function criterionResultToDoc(
  result: CriterionResult,
  evaluationId: string,
): CriterionResultDoc {
  if (!result.evidence || result.evidence.trim().length === 0) {
    throw new Error(
      `Refusing to store evaluation ${evaluationId}: result for ` +
        `'${result.criterionKey}' has no evidence. No score without evidence applies ` +
        `to the database as well as to the UI.`,
    );
  }

  return {
    criterionKey: result.criterionKey,
    score: result.score,
    evidence: result.evidence,
    concern: result.concern,
    suggestion: result.suggestion,
    confidence: result.confidence,
  };
}

/**
 * Re-validated through the domain factory on the way out, so a stored result that
 * somehow lost its evidence throws here rather than reaching a React component.
 */
function criterionResultFromDoc(
  doc: CriterionResultDoc,
  evaluationId: string,
): CriterionResult {
  try {
    return createCriterionResult({
      criterionKey: doc.criterionKey,
      score: doc.score,
      evidence: doc.evidence,
      concern: doc.concern ?? '',
      suggestion: doc.suggestion,
      confidence: doc.confidence,
    });
  } catch (error) {
    throw new Error(
      `Stored evaluation ${evaluationId} has an invalid result for ` +
        `'${doc.criterionKey}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
