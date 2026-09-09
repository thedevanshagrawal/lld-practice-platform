/**
 * Free salvage, step 1 of §6.1. No API call, no cost, fixes the large majority of real
 * failures before the repair call is even considered.
 *
 * Handles the three malformed shapes named in the spec:
 *
 *   1. PROSE      — "Here is my evaluation:\n```json\n{...}\n```\nHope that helps!"
 *                   Fences and surrounding prose are stripped; the object is extracted.
 *   2. TRUNCATED  — output hit maxOutputTokens mid-string. No balanced object exists, so
 *                   salvage HONESTLY FAILS and the repair call takes over. It deliberately
 *                   does not try to close the braces itself: a guessed closing brace
 *                   produces a syntactically valid object with a silently invented tail,
 *                   which is the worst possible outcome for an evidence-based system.
 *   3. WRONG SHAPE— parses fine, so salvage succeeds and Ajv is the layer that rejects it.
 *
 * The rule salvage must never break (§6.1): NEVER regex-scrape scores out of broken JSON.
 * A score extracted that way has no verified evidence behind it, which is precisely the
 * failure the platform exists to prevent. Salvage recovers a whole object or nothing.
 */

export type SalvageResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: string };

export function salvageJson(raw: string): SalvageResult {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, reason: 'Response was empty.' };
  }

  const stripped = stripCodeFences(raw).trim();

  const direct = tryParse(stripped);
  if (direct.ok) return direct;

  const extracted = extractOutermostObject(stripped);
  if (extracted === null) {
    return {
      ok: false,
      reason: 'No balanced JSON object could be found in the response (likely truncated or prose-only).',
    };
  }

  const fromExtract = tryParse(extracted);
  if (fromExtract.ok) return fromExtract;

  return { ok: false, reason: 'Extracted a candidate object but it did not parse as JSON.' };
}

function tryParse(text: string): SalvageResult {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'JSON.parse failed.' };
  }
}

function stripCodeFences(raw: string): string {
  const fenced = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(raw);
  if (fenced && fenced[1]) return fenced[1];

  // An opening fence with no closing fence is the truncation case; drop the opener and
  // let brace matching decide whether anything usable survived.
  return raw.replace(/```(?:json|JSON)?/g, '');
}

/**
 * Brace matching that understands JSON strings, so a `{` inside a learner quote does not
 * throw the count off. This matters: evidence fields contain the learner's own text.
 */
function extractOutermostObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  // Unbalanced: truncated mid-object. Refuse to guess the tail.
  return null;
}

/** Detects a plain-text refusal or off-task reply (§6.3) before wasting a repair call on it. */
const REFUSAL_MARKERS = [
  "i can't",
  'i cannot',
  'i am unable',
  "i'm unable",
  'i am not able',
  'as an ai',
  'i must decline',
  'i will not',
  'sorry, but',
];

export function looksLikeRefusal(raw: string): boolean {
  const head = raw.trim().slice(0, 400).toLowerCase();
  if (head.includes('{')) return false;
  return REFUSAL_MARKERS.some((marker) => head.includes(marker));
}
