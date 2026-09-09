import type { GetAttemptResult, GetHistoryResult } from '@/application';
import type { Problem } from '@/domain/Problem';
import type { Rubric } from '@/domain/rubric/Rubric';
import type { Score } from '@/domain/rubric/Criterion';
import type { AttemptStatus } from '@/domain/attempt/AttemptStatus';
import { TextDesignContent } from '@/domain/content/TextDesignContent';
import type {
  DeclaredClass,
  DeclaredRelationship,
  RelationshipKind,
} from '@/domain/content/StructuralFacts';

/**
 * Wire shapes. Explicit rather than `JSON.stringify(useCaseResult)` because the use
 * cases return domain objects with private fields and Date instances, and a UI that
 * accidentally depends on `_sections` leaking through a serializer is a UI that breaks
 * the day the domain refactors.
 *
 * `score: number | null` survives the trip intact. It is never coalesced to 0 anywhere
 * on this path — see the renderer in src/app/attempts/[id]/page.tsx.
 */

export interface CriterionResultDto {
  readonly criterionKey: string;
  readonly label: string;
  readonly weight: number;
  /** null means "not assessed, no evidence found". NOT zero. */
  readonly score: number | null;
  readonly evidence: string;
  readonly concern: string;
  readonly suggestion: string;
  readonly confidence: number;
  /** The band descriptor for the score that was given, when one was. */
  readonly anchor: string | null;
}

/**
 * A measured fact about the submission — a count, a missing section, a method tally.
 * Never a score and never a percentage. Carried separately from `criteria` so the UI
 * cannot accidentally render one as the other.
 */
export interface StructuralFindingDto {
  readonly checkId: string;
  readonly severity: 'blocker' | 'warning' | 'info';
  readonly message: string;
  readonly location: string;
}

export interface AttemptDto {
  readonly attemptId: string;
  readonly learnerId: string;
  readonly attemptNumber: number;
  readonly status: AttemptStatus;
  readonly submittedAt: string | null;
  readonly failureReason: string | null;
  readonly isEvaluating: boolean;
  readonly canRetryEvaluation: boolean;
  readonly problem: { id: string; slug: string; title: string };
  /** The submission as the evaluator saw it. Null before submit. */
  readonly submittedText: string | null;
  readonly evaluation: {
    readonly id: string;
    readonly runNumber: number;
    readonly outcome: string;
    readonly overall: { weighted: number | null; assessedWeight: number };
    readonly failures: readonly { tag: string; adapter: string; reason: string }[];
    readonly createdAt: string;
  } | null;
  /**
   * ONE ENTRY PER RUBRIC CRITERION, always, in rubric order — including criteria the
   * evaluator never returned a result for. A missing criterion and a null score are the
   * same statement to the learner ("we could not assess this"), and the UI should not
   * have to reconcile two different absences.
   */
  readonly criteria: readonly CriterionResultDto[];
  /**
   * Recomputed on every read. Present whether or not the LLM ran, which is the point:
   * on a FAILED attempt this is the only feedback there is.
   */
  readonly structuralFindings: readonly StructuralFindingDto[];
}

export function toAttemptDto(result: GetAttemptResult): AttemptDto {
  const byKey = new Map(
    (result.evaluation?.results ?? []).map((r) => [r.criterionKey, r] as const),
  );

  const criteria: CriterionResultDto[] = result.rubric.criteria.map((criterion) => {
    const found = byKey.get(criterion.key);
    if (!found) {
      return {
        criterionKey: criterion.key,
        label: criterion.label,
        weight: criterion.weight,
        score: null,
        evidence: '',
        concern: '',
        suggestion: '',
        confidence: 0,
        anchor: null,
      };
    }
    return {
      criterionKey: criterion.key,
      label: criterion.label,
      weight: criterion.weight,
      score: found.score,
      evidence: found.evidence,
      concern: found.concern,
      suggestion: found.suggestion,
      confidence: found.confidence,
      anchor: found.score === null ? null : criterion.anchors[found.score as Score],
    };
  });

  return {
    attemptId: result.attemptId,
    learnerId: result.learnerId,
    attemptNumber: result.attemptNumber,
    status: result.status,
    submittedAt: result.submittedAt?.toISOString() ?? null,
    failureReason: result.failureReason,
    isEvaluating: result.isEvaluating,
    canRetryEvaluation: result.canRetryEvaluation,
    problem: {
      id: result.problem.id,
      slug: result.problem.slug,
      title: result.problem.title,
    },
    submittedText: result.content?.toEvaluationText() ?? null,
    evaluation: result.evaluation
      ? {
          id: result.evaluation.id,
          runNumber: result.evaluation.runNumber,
          outcome: result.evaluation.outcome,
          overall: {
            weighted: result.evaluation.overall.weighted,
            assessedWeight: result.evaluation.overall.assessedWeight,
          },
          failures: result.evaluation.failures.map((f) => ({
            tag: f.tag,
            adapter: f.adapter,
            reason: f.reason,
          })),
          createdAt: result.evaluation.createdAt.toISOString(),
        }
      : null,
    criteria,
    structuralFindings: result.structuralFindings.map((finding) => ({
      checkId: finding.checkId,
      severity: finding.severity,
      message: finding.message,
      location: finding.location,
    })),
  };
}

export interface HistoryDto {
  readonly learnerId: string;
  readonly problem: { id: string; slug: string; title: string };
  readonly rubricVersion: number;
  readonly attempts: readonly {
    attemptId: string;
    attemptNumber: number;
    status: AttemptStatus;
    submittedAt: string | null;
    overallWeighted: number | null;
    scoresByCriterion: Record<string, number>;
  }[];
  /** The product requirement: per-criterion movement, with deltas and a direction. */
  readonly movements: readonly {
    criterionKey: string;
    label: string;
    points: readonly { attemptNumber: number; score: number }[];
    steps: readonly {
      fromAttemptNumber: number;
      toAttemptNumber: number;
      from: number;
      to: number;
      change: number;
    }[];
    delta: number | null;
    direction: 'IMPROVED' | 'REGRESSED' | 'FLAT' | 'UNKNOWN';
    isRecurringWeakness: boolean;
  }[];
  readonly excludedAttemptIds: readonly string[];
}

export function toHistoryDto(result: GetHistoryResult): HistoryDto {
  return {
    learnerId: result.learnerId,
    problem: {
      id: result.problem.id,
      slug: result.problem.slug,
      title: result.problem.title,
    },
    rubricVersion: result.rubricVersion,
    attempts: result.attempts.map((a) => ({
      attemptId: a.attemptId,
      attemptNumber: a.attemptNumber,
      status: a.status,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      overallWeighted: a.overall?.weighted ?? null,
      scoresByCriterion: { ...a.scoresByCriterion },
    })),
    movements: result.movements.map((m) => ({
      criterionKey: m.criterionKey,
      label: m.label,
      points: m.points.map((p) => ({ attemptNumber: p.attemptNumber, score: p.score })),
      steps: m.steps.map((s) => ({
        fromAttemptNumber: s.fromAttemptNumber,
        toAttemptNumber: s.toAttemptNumber,
        from: s.from,
        to: s.to,
        change: s.change,
      })),
      delta: m.delta,
      direction: m.direction,
      isRecurringWeakness: m.isRecurringWeakness,
    })),
    excludedAttemptIds: [...result.excludedAttemptIds],
  };
}

export interface ProblemDto {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly statement: string;
  readonly requirements: readonly string[];
  readonly constraints: readonly string[];
}

export function toProblemDto(problem: Problem): ProblemDto {
  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    statement: problem.statement,
    requirements: [...problem.requirements],
    constraints: [...problem.constraints],
  };
}

export interface RubricDto {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly criteria: readonly {
    key: string;
    label: string;
    weight: number;
    guidance: string;
  }[];
}

export function toRubricDto(rubric: Rubric): RubricDto {
  return {
    id: rubric.id,
    version: rubric.version,
    name: rubric.name,
    criteria: rubric.criteria.map((c) => ({
      key: c.key,
      label: c.label,
      weight: c.weight,
      guidance: c.guidance,
    })),
  };
}

// ===========================================================================
// Inbound: the locked four-field structured-text format -> TextDesignContent
// ===========================================================================

const RELATIONSHIP_KINDS: readonly RelationshipKind[] = [
  'ASSOCIATION',
  'AGGREGATION',
  'COMPOSITION',
  'INHERITANCE',
  'IMPLEMENTS',
  'DEPENDENCY',
  'UNSPECIFIED',
];

function lines(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

function splitMethods(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/[,\n;]/)
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

/**
 * `Wallet -> Ticket [COMPOSITION] : one ticket per entry`
 *
 * Everything except the two names is optional; a line with no arrow is still kept
 * rather than dropped, because silently discarding a learner's words and then telling
 * them their relationships section was empty is the worst possible feedback.
 */
function parseRelationship(line: string): DeclaredRelationship {
  let rest = line;
  let kind: RelationshipKind = 'UNSPECIFIED';

  const bracket = /\[([A-Za-z_]+)\]/.exec(rest);
  if (bracket) {
    const candidate = bracket[1]!.toUpperCase() as RelationshipKind;
    if (RELATIONSHIP_KINDS.includes(candidate)) {
      kind = candidate;
      rest = rest.replace(bracket[0], ' ').trim();
    }
  }

  let note: string | null = null;
  const colon = rest.indexOf(':');
  if (colon >= 0) {
    const tail = rest.slice(colon + 1).trim();
    if (tail.length > 0) note = tail;
    rest = rest.slice(0, colon).trim();
  }

  const arrow = /\s*(?:-->|->|→|<-|--|\bto\b)\s*/.exec(rest);
  if (!arrow) {
    return { from: rest.trim(), to: '(unspecified)', kind, note };
  }

  const from = rest.slice(0, arrow.index).trim();
  const to = rest.slice(arrow.index + arrow[0].length).trim();
  return {
    from: from.length > 0 ? from : '(unspecified)',
    to: to.length > 0 ? to : '(unspecified)',
    kind,
    note,
  };
}

export interface SubmissionBody {
  readonly content: TextDesignContent;
  readonly idempotencyKey: string;
}

export class SubmissionBodyError extends Error {}

/**
 * The ONLY place the HTTP shape of the four locked fields is decoded. Adding a diagram
 * format later adds a branch here and a new content class in the domain; nothing in
 * between changes.
 */
export function parseSubmissionBody(body: Record<string, unknown>): SubmissionBody {
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  if (idempotencyKey.length === 0) {
    throw new SubmissionBodyError('idempotencyKey is required and must be a non-empty string.');
  }

  const rawClasses = Array.isArray(body.classes) ? body.classes : [];
  const classes: DeclaredClass[] = rawClasses
    .map((entry): DeclaredClass | null => {
      if (entry === null || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (name.length === 0) return null;
      const responsibility =
        typeof row.responsibility === 'string' && row.responsibility.trim().length > 0
          ? row.responsibility.trim()
          : null;
      return { name, responsibility, methodNames: splitMethods(row.methods) };
    })
    .filter((c): c is DeclaredClass => c !== null);

  const content = TextDesignContent.fromSections({
    assumptions: lines(body.assumptions),
    classes,
    relationships: lines(body.relationships).map(parseRelationship),
    tradeOffs: lines(body.tradeOffs),
  });

  // Deliberately permissive: an empty section is a real submission that the
  // deterministic checks will flag as missing. Rejecting it here would replace honest
  // feedback with a form error, which teaches the learner nothing.
  return { content, idempotencyKey };
}
