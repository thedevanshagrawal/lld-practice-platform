import type { AttemptId, CriterionKey, EvaluatorTag, RubricId } from './ids';

export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class IllegalAttemptTransitionError extends DomainError {
  readonly code = 'ILLEGAL_ATTEMPT_TRANSITION';

  constructor(
    readonly from: string,
    readonly to: string,
    readonly attemptId: AttemptId,
  ) {
    super(
      `Illegal attempt transition ${from} → ${to} on attempt ${attemptId}`,
    );
  }
}

export class InvalidCriterionResultError extends DomainError {
  readonly code = 'INVALID_CRITERION_RESULT';

  constructor(
    readonly criterionKey: CriterionKey,
    readonly field: 'score' | 'evidence' | 'concern' | 'suggestion' | 'confidence',
    detail: string,
  ) {
    super(
      `Invalid ${field} for criterion ${criterionKey}: ${detail}`,
    );
  }
}

export class UnknownCriterionError extends DomainError {
  readonly code = 'UNKNOWN_CRITERION';

  constructor(
    readonly criterionKey: CriterionKey,
    readonly rubricId: RubricId,
  ) {
    super(
      `Criterion ${criterionKey} not found in rubric ${rubricId}`,
    );
  }
}

export class DuplicateCriterionResultError extends DomainError {
  readonly code = 'DUPLICATE_CRITERION_RESULT';

  constructor(
    readonly criterionKey: CriterionKey,
    readonly tags: readonly EvaluatorTag[],
  ) {
    super(
      `Criterion ${criterionKey} scored by multiple evaluators: ${tags.join(', ')}`,
    );
  }
}
