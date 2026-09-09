import type { RawCriterionResult } from './responseSchema';

/**
 * The check that makes "No Score Without Evidence" true rather than aspirational
 * (RUBRIC_AND_EVALUATION.md §5.3).
 *
 * The JSON Schema can require that `evidence` is a non-empty string. It cannot require
 * that the string is something the learner actually wrote. This can, and it is the only
 * defence against the failure mode the whole platform is built against: a plausible
 * score attached to a quote the model invented.
 *
 * KNOWN LIMITATION, ACCEPTED DELIBERATELY (§9.4): this is substring matching. A
 * near-verbatim quote with one word changed is rejected. That trade is intentional —
 * a false rejection costs the learner one criterion and an honest "not evidenced" row;
 * a false acceptance costs the platform its core promise.
 */
export type EvidenceVerdict = 'ok' | 'unverified';

export const MIN_QUOTE_LENGTH = 10;

/** Case, smart quotes, dashes and whitespace normalised. Nothing else. */
export function normaliseForEvidence(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function verifyEvidence(
  result: Pick<RawCriterionResult, 'score' | 'evidence'>,
  submissionText: string,
): EvidenceVerdict {
  if (result.score === null) {
    // A null score is only honest if it says so. "null with a quote attached" is a
    // different failure and is repaired, not accepted — see §6.4.
    return result.evidence.startsWith('NO EVIDENCE:') ? 'ok' : 'unverified';
  }

  if (!result.evidence || result.evidence.trim().length < MIN_QUOTE_LENGTH) {
    return 'unverified';
  }

  const haystack = normaliseForEvidence(submissionText);
  const quotes = result.evidence
    .split('|')
    .map(normaliseForEvidence)
    .filter((q) => q.length >= MIN_QUOTE_LENGTH);

  if (quotes.length === 0) return 'unverified';

  // ONE verified quote is enough. The model is allowed to bundle a weak second quote
  // with a strong first one; requiring every fragment to match would reject good
  // results for a cosmetic reason.
  return quotes.some((q) => haystack.includes(q)) ? 'ok' : 'unverified';
}
