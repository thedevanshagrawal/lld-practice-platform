import type { SubmissionContentKind } from '../../domain/content/SubmissionContent';
import type {
  DeclaredClass,
  DeclaredRelationship,
  SectionKey,
} from '../../domain/content/StructuralFacts';

/**
 * The stored shapes. Written out explicitly rather than derived from the domain
 * types, because a document is a wire format with its own compatibility rules: the
 * day a domain field is renamed, this file is the diff that shows what has to be
 * migrated. Deriving it would hide that.
 *
 * Every optional-looking field is `T | null`, never `T | undefined`. `undefined` is
 * how a field silently disappears between memory and disk.
 */

export interface ProblemDoc {
  _id: string;
  slug: string;
  title: string;
  statement: string;
  requirements: string[];
  constraints: string[];
  rubricId: string;
}

export interface CriterionDoc {
  key: string;
  label: string;
  weight: number;
  guidance: string;
  /** Keys are the score levels '0'..'4'; Mongo has no numeric object keys. */
  anchors: Record<string, string>;
  assessedBy: string;
}

export interface RubricDoc {
  /** `${rubricId}@${version}` — every version is retained, none overwrite. */
  _id: string;
  rubricId: string;
  version: number;
  name: string;
  criteria: CriterionDoc[];
}

export interface TextDesignContentDoc {
  kind: 'TEXT_DESIGN';
  sections: {
    assumptions: string[];
    classes: DeclaredClass[];
    relationships: DeclaredRelationship[];
    tradeOffs: string[];
  };
}

/** Widened when a format is added. The mapper's switch then fails to compile. */
export type SubmissionContentDoc = TextDesignContentDoc;

export interface SubmissionDoc {
  id: string;
  attemptId: string;
  content: SubmissionContentDoc;
  submittedAt: Date;
  idempotencyKey: string;
}

export interface AttemptDoc {
  _id: string;
  learnerId: string;
  problemId: string;
  attemptNumber: number;
  status: string;
  createdAt: Date;
  submission: SubmissionDoc | null;
  latestEvaluationId: string | null;
  failureReason: string | null;
  /**
   * Derived, infrastructure-only: `submission.submittedAt ?? createdAt`. Exists so
   * the recovery sweep is one indexed query instead of a scan plus a filter, and it
   * matches how the in-memory adapter picks the same timestamp.
   */
  activityAt: Date;
}

export interface CriterionResultDoc {
  criterionKey: string;
  /** null means "not evidenced, deliberately unscored". It is NOT zero. */
  score: number | null;
  evidence: string;
  concern: string;
  suggestion: string;
  confidence: number;
}

export interface EvaluationDoc {
  _id: string;
  attemptId: string;
  rubricId: string;
  rubricVersion: number;
  runNumber: number;
  results: CriterionResultDoc[];
  overall: { weighted: number | null; assessedWeight: number };
  outcome: string;
  contributions: { tag: string; adapter: string; criterionKeys: string[] }[];
  failures: { tag: string; adapter: string; reason: string }[];
  createdAt: Date;
}

/** Re-exported so mappers can name the domain vocabulary without a second import. */
export type { SubmissionContentKind, SectionKey };
