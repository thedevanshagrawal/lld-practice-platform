import type { Criterion } from '../domain/rubric/Criterion';
import type { Rubric } from '../domain/rubric/Rubric';

/**
 * The MVP rubric, verbatim from RUBRIC_AND_EVALUATION.md §1 — five criteria, weights
 * summing to 1.00.
 *
 * This file is DATA. There is no Criterion subclass anywhere in the codebase, which
 * is the point: re-weighting a dimension, rewriting guidance after the model misreads
 * something, or moving a criterion from the LLM to a rules engine is an edit to this
 * seed document, not a code change, a deploy and a migration of historical scores.
 *
 * `assessedBy` is the whole of evaluator wiring. It is a CAPABILITY, never a vendor:
 * swapping Gemini for another model changes one adapter and zero rows here.
 *
 * Bump `MVP_RUBRIC_VERSION` on any change to keys, weights or criteria. Every
 * Evaluation stores the version it was scored under, and the history view refuses to
 * draw a trend across a version boundary — comparing two rulers is not a trend.
 */

export const MVP_RUBRIC_ID = 'rubric-lld-mvp';
export const MVP_RUBRIC_VERSION = 1;

const NOT_DEMONSTRATED =
  'Not demonstrated. The submission contains no quotable evidence for this dimension, so it is reported as unassessed rather than scored.';

export const REQUIREMENTS_AND_ASSUMPTIONS: Criterion = {
  key: 'requirements_and_assumptions',
  label: 'Requirement Understanding & Assumptions',
  weight: 0.2,
  assessedBy: 'llm',
  guidance: [
    "Read the assumptions section against the problem statement's requirements and constraints.",
    'Look for: assumptions that close a real ambiguity rather than restating the prompt;',
    'scope drawn explicitly, including what is deliberately not modelled;',
    'clarifying questions whose answers would actually change the design;',
    'and assumptions that the class list actually honours. An assumption contradicted by',
    'the classes is worse than no assumption at all.',
  ].join(' '),
  anchors: {
    0: NOT_DEMONSTRATED,
    1: 'No assumptions, or assumptions that restate the problem ("the parking lot parks cars"). No scope boundary. The statement\'s ambiguities are left untouched.',
    2: 'Two or three real assumptions, but narrow or incidental — they leave the main ambiguity unresolved, or nothing in the class list reflects them.',
    3: 'Assumptions resolve the ambiguities that actually affect the model, scope is bounded explicitly, and the class list is consistent with them.',
    4: 'As Proficient, plus at least one assumption is named as a decision with an alternative, and the clarifying questions are ones whose answers would change the design.',
  },
};

export const RESPONSIBILITIES_AND_DECOMPOSITION: Criterion = {
  key: 'responsibilities_and_decomposition',
  label: 'Class Responsibilities & Decomposition (SRP)',
  weight: 0.25,
  assessedBy: 'llm',
  guidance: [
    'Read each class name, its one-line responsibility and its key methods together.',
    'Does the responsibility describe one job, or use "and" to hide two?',
    'Do the listed methods all plausibly belong to that stated responsibility?',
    'Is the decomposition domain-shaped (Slot, Ticket, PricingPolicy) or layer-shaped',
    '(Manager, Handler, Helper doing everything)? Are collaborators the requirements',
    'clearly imply simply missing? Is a responsibility line vacuous ("Ticket: a ticket"),',
    'which is a naming exercise rather than design?',
  ].join(' '),
  anchors: {
    0: NOT_DEMONSTRATED,
    1: 'One class holds most of the behaviour, or responsibility lines are tautological ("Car — a car"). Method lists mix unrelated concerns (allocation, pricing, persistence, I/O) on a single class.',
    2: 'Several sensibly-named classes exist, but at least one responsibility line joins two jobs with "and", or one class visibly absorbs work belonging elsewhere, or an obvious collaborator is missing.',
    3: 'Every class states a single job and every listed method fits that job. The decomposition covers the stated requirements with no obvious missing collaborator and no dumping ground.',
    4: 'As Proficient, plus responsibilities are split along the axes that actually change — policy separated from mechanism — and the learner says why a candidate class was not created.',
  },
};

export const COUPLING_AND_COHESION: Criterion = {
  key: 'coupling_and_cohesion',
  label: 'Coupling & Cohesion',
  weight: 0.2,
  assessedBy: 'llm',
  guidance: [
    'Read the relationships section plus the method signatures for what each class must know about.',
    'Does each class depend on the fewest others it needs, or is there a hub every class points at?',
    'Are relationships stated with direction and reason, or as undirected mush ("all classes interact")?',
    'Do methods leak internals — passing whole aggregates where an id would do, or reaching two levels deep?',
    'Is behaviour grouped with the data it acts on? Is any bidirectional link justified, or accidental?',
  ].join(' '),
  anchors: {
    0: NOT_DEMONSTRATED,
    1: 'Relationships missing, or listed as a flat "these classes use each other". One class is referenced by nearly every other with no direction given.',
    2: 'Relationships have direction, but at least one is unjustified bidirectional coupling, or a method signature shows a class reaching through another to touch a third.',
    3: 'Dependency directions are stated and defensible, each class knows only its direct collaborators, and related behaviour sits with the data it acts on.',
    4: 'As Proficient, plus the learner names a direction as a deliberate containment choice ("payment depends on the ticket, not the reverse, so pricing changes never reach the parking flow").',
  },
};

export const ABSTRACTION_AND_INTERFACES: Criterion = {
  key: 'abstraction_and_interfaces',
  label: 'Abstraction, Interfaces & Pattern Appropriateness',
  weight: 0.2,
  assessedBy: 'llm',
  guidance: [
    'Every abstraction must be earned. Penalise patternitis exactly as hard as missing abstraction —',
    'both directions are failures. Is there an interface exactly where the problem has more than one',
    'plausible implementation? Is there an interface with one implementation and no stated reason to',
    'expect a second (speculative generality)? Are named patterns tied to a problem force, or',
    'name-dropped? Do abstractions sit at a consistent level? Does anything depend on a concrete class',
    'where the requirements clearly imply variation?',
  ].join(' '),
  anchors: {
    0: NOT_DEMONSTRATED,
    1: 'No interfaces or abstract types anywhere despite obvious variation in the requirements; or patterns named with no reason beyond the pattern\'s own name.',
    2: 'One reasonable abstraction exists, but a clearly-varying concern is still bound to a concrete class, or an abstraction exists with one implementation and no stated future need. Justification is thin ("standard practice", "it is cleaner").',
    3: 'Abstractions sit where the requirements state variation, each justified by a named force, with no unused abstraction introduced. Patterns are described by what varies, not by pattern name.',
    4: 'As Proficient, plus the learner explicitly declines an abstraction and says why. Knowing where not to abstract is the strongest signal here.',
  },
};

export const EXTENSIBILITY: Criterion = {
  key: 'extensibility',
  label: 'Extensibility Under a New Requirement',
  weight: 0.15,
  assessedBy: 'llm',
  guidance: [
    'Judge the trade-offs section as a concrete change-impact analysis rather than a promise.',
    'Does the learner name which classes change, which are added, and which stay untouched?',
    'Is the change localised by the design they actually proposed, or does it quietly require a',
    'redesign they have not admitted to? Is open/closed demonstrated by the walkthrough, or merely',
    'asserted? Does the learner acknowledge a cost — a change their design would make expensive?',
  ].join(' '),
  anchors: {
    0: NOT_DEMONSTRATED,
    1: 'No extension discussion, or a generic claim ("my design is scalable and follows SOLID") with no class named.',
    2: 'A new requirement is discussed, but only additions are named — no existing class is traced as changing — or the traced change contradicts the class list above.',
    3: 'The walkthrough names specific classes added and specific classes modified, and the blast radius is consistent with the relationships described earlier.',
    4: 'As Proficient, plus the learner names at least one requirement their design would handle badly and what they would restructure — an honest limitation, not a sales pitch.',
  },
};

/** Order matters only for display and for prompt rendering; it carries no precedence. */
export const MVP_RUBRIC_CRITERIA: readonly Criterion[] = [
  REQUIREMENTS_AND_ASSUMPTIONS,
  RESPONSIBILITIES_AND_DECOMPOSITION,
  COUPLING_AND_COHESION,
  ABSTRACTION_AND_INTERFACES,
  EXTENSIBILITY,
];

export const MVP_RUBRIC: Rubric = {
  id: MVP_RUBRIC_ID,
  version: MVP_RUBRIC_VERSION,
  name: 'LLD Design Review — MVP rubric (5 criteria)',
  criteria: MVP_RUBRIC_CRITERIA,
};

export const SEED_RUBRICS: readonly Rubric[] = [MVP_RUBRIC];
