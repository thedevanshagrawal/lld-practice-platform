'use client';

/**
 * "Auth", such as it is.
 *
 * There is no login and no session. The learner id is a string in localStorage, and the
 * README states plainly that anyone can read anyone's attempts. It is a deliberate MVP
 * cut, not an oversight: `learnerId` is already just an id everywhere below this file,
 * and there is no `Learner` aggregate, so adding real auth later replaces this module
 * and touches nothing in the domain.
 */

const KEY = 'lld.learnerId';
const FALLBACK = 'learner-anonymous';

/** Slugged so it is safe in a query string and readable in the database. */
function toLearnerId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? `learner-${slug}` : FALLBACK;
}

export function getLearnerId(): string {
  if (typeof window === 'undefined') return FALLBACK;
  try {
    return window.localStorage.getItem(KEY) ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function setLearnerName(name: string): string {
  const id = toLearnerId(name);
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Private browsing. The in-memory fallback id still works for this page load.
  }
  return id;
}

export function learnerDisplayName(learnerId: string): string {
  return learnerId.replace(/^learner-/, '') || 'anonymous';
}
