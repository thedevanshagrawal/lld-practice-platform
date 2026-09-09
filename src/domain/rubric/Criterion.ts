import type { CriterionKey, EvaluatorTag } from '../ids';

export const SCORE_MIN = 0;
export const SCORE_MAX = 4;

/** 0 not demonstrated · 1 novice · 2 developing · 3 proficient · 4 exemplary */
export type Score = 0 | 1 | 2 | 3 | 4;

/** 0..1 inclusive. */
export type Confidence = number;

export interface Criterion {
  readonly key: CriterionKey;
  readonly label: string;
  /** 0..1. Weights across a rubric sum to 1. */
  readonly weight: number;
  /** What an evaluator is told to look for. Prompt text is config, not code. */
  readonly guidance: string;
  /** What each score level means. Makes the rubric analytical and anchored. */
  readonly anchors: Readonly<Record<Score, string>>;
  /** Which evaluator capability owns this criterion. Coverage is configuration. */
  readonly assessedBy: EvaluatorTag;
}

export function isScore(value: number): value is Score {
  return Number.isInteger(value) && value >= SCORE_MIN && value <= SCORE_MAX;
}

export function isConfidence(value: number): boolean {
  return typeof value === 'number' && value >= 0 && value <= 1;
}
