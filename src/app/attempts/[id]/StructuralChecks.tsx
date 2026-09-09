'use client';

import type { StructuralFindingDto } from '@/app/api/_lib/dto';

/**
 * Automated structural checks — MEASURED FACTS, never scores.
 *
 * Deliberately its own section, well away from the rubric criteria, and deliberately
 * without a number anywhere in it. A method count is a measurement; presenting it as a
 * design judgement ("structure: 2/4") is exactly the ungrounded confidence this platform
 * exists to avoid. So: no score, no percentage, no bar, no aggregate.
 *
 * It renders on every submitted attempt, including a FAILED one. That is the whole
 * reason it exists: every criterion in the MVP rubric is scored by the LLM, so when
 * Gemini is unavailable the stored Evaluation has zero results and this section is the
 * only feedback the learner has. Reliability that only holds on the happy path is not
 * reliability.
 */
const SEVERITY_STYLE: Record<StructuralFindingDto['severity'], string> = {
  blocker: 'border-red-400 bg-red-50',
  warning: 'border-amber-400 bg-amber-50',
  info: 'border-zinc-200 bg-white',
};

const SEVERITY_LABEL: Record<StructuralFindingDto['severity'], string> = {
  blocker: 'Blocks assessment',
  warning: 'Worth looking at',
  info: 'Observation',
};

export function StructuralChecks({
  findings,
}: {
  findings: readonly StructuralFindingDto[];
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-medium">Automated structural checks</h2>
      <p className="text-xs text-zinc-600 max-w-prose">
        Facts measured directly from what you wrote — section presence, class and method
        counts. These are not scores and do not contribute to any score. They run whether
        or not the AI evaluation succeeded.
      </p>

      {findings.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No structural checks were produced for this submission.
        </p>
      ) : (
        <ul className="space-y-2">
          {findings.map((finding) => (
            <li
              key={finding.checkId}
              className={`border rounded p-3 text-sm ${SEVERITY_STYLE[finding.severity]}`}
            >
              <p className="text-zinc-900">{finding.message}</p>
              <p className="text-xs text-zinc-600 mt-1">
                {SEVERITY_LABEL[finding.severity]} · check {finding.checkId} ·{' '}
                {finding.location}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
