export type SectionKey = 'ASSUMPTIONS' | 'CLASSES' | 'RELATIONSHIPS' | 'TRADE_OFFS';

export type RelationshipKind =
  | 'ASSOCIATION'
  | 'AGGREGATION'
  | 'COMPOSITION'
  | 'INHERITANCE'
  | 'IMPLEMENTS'
  | 'DEPENDENCY'
  | 'UNSPECIFIED';

export interface DeclaredClass {
  readonly name: string;
  /** null when the learner named a class but gave it no responsibility line. */
  readonly responsibility: string | null;
  readonly methodNames: readonly string[];
}

export interface DeclaredRelationship {
  readonly from: string;
  readonly to: string;
  readonly kind: RelationshipKind;
  readonly note: string | null;
}

/**
 * Format-neutral. Every field is answerable from structured text today and from a
 * class diagram tomorrow. A format that cannot answer a field reports it honestly
 * (absent section, empty list) rather than guessing.
 */
export interface StructuralFacts {
  readonly sectionsPresent: readonly SectionKey[];
  readonly classes: readonly DeclaredClass[];
  readonly relationships: readonly DeclaredRelationship[];
  readonly assumptionCount: number;
  readonly tradeOffCount: number;
  readonly wordCount: number;
}
