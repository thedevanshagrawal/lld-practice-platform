export type AttemptStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'EVALUATING'
  | 'COMPLETED'
  | 'FAILED';

export const ATTEMPT_STATUSES: readonly AttemptStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'EVALUATING',
  'COMPLETED',
  'FAILED',
];

/** The state machine as data: readable at a glance, testable exhaustively. */
export const ATTEMPT_TRANSITIONS: Readonly<Record<AttemptStatus, readonly AttemptStatus[]>> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['EVALUATING'],
  EVALUATING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['EVALUATING'],
} as const;

export function isLegalTransition(from: AttemptStatus, to: AttemptStatus): boolean {
  return (ATTEMPT_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function isTerminal(status: AttemptStatus): boolean {
  return ATTEMPT_TRANSITIONS[status].length === 0;
}
