/**
 * Application-layer errors. Separate from DomainError on purpose: a DomainError is
 * an invariant violation ("that transition is illegal"), an ApplicationError is a
 * request that cannot be served ("no attempt with that id"). The HTTP layer maps
 * `code` to a status; nothing above this layer pattern-matches on message text.
 */
export abstract class ApplicationError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ProblemNotFoundError extends ApplicationError {
  readonly code = 'PROBLEM_NOT_FOUND';

  constructor(readonly reference: string) {
    super(`No problem found for '${reference}'`);
  }
}

export class AttemptNotFoundError extends ApplicationError {
  readonly code = 'ATTEMPT_NOT_FOUND';

  constructor(readonly attemptId: string) {
    super(`No attempt found with id '${attemptId}'`);
  }
}

export class RubricNotFoundError extends ApplicationError {
  readonly code = 'RUBRIC_NOT_FOUND';

  constructor(readonly rubricId: string, readonly version?: number) {
    super(
      `No rubric found with id '${rubricId}'` +
        (version === undefined ? '' : ` at version ${version}`),
    );
  }
}

/**
 * Raised when an attempt is asked to be evaluated but carries no stored submission.
 * If this ever fires, the store-before-evaluate guarantee has been broken upstream
 * and we want a loud, specific error rather than a null dereference in the pipeline.
 */
export class MissingSubmissionError extends ApplicationError {
  readonly code = 'MISSING_SUBMISSION';

  constructor(readonly attemptId: string) {
    super(`Attempt '${attemptId}' has no stored submission to evaluate`);
  }
}

export class InvalidSubmissionError extends ApplicationError {
  readonly code = 'INVALID_SUBMISSION';

  constructor(readonly field: string, detail: string) {
    super(`Invalid submission (${field}): ${detail}`);
  }
}
