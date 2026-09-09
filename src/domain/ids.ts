export type Id = string;

export type LearnerId = string;
export type ProblemId = Id;
export type AttemptId = Id;
export type SubmissionId = Id;
export type EvaluationId = Id;
export type RubricId = Id;

/** Stable key of a rubric dimension, e.g. 'COUPLING_COHESION'. */
export type CriterionKey = string;

/** A capability, not a vendor: 'deterministic' | 'llm' | 'human'. */
export type EvaluatorTag = string;
