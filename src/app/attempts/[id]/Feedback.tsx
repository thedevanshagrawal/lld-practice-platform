'use client';

import type { AttemptDto, CriterionResultDto } from '@/app/api/_lib/dto';

const SCORE_MAX = 4;

/**
 * Screen 4 — per-criterion feedback.
 *
 * THE ONE RULE THIS COMPONENT EXISTS TO ENFORCE: a null score is NOT zero.
 *
 * "The evaluator could not find evidence for this" and "the learner did this badly" are
 * different statements about the learner's work, and the learner is entitled to the
 * difference. A null therefore renders as the words "not assessed — no evidence found",
 * never as 0, and never as an empty bar at 0% — an empty bar reads as a zero to anyone
 * who glances at it, which is the same lie in a different font.
 */
function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="text-sm border border-zinc-400 bg-zinc-100 text-zinc-700 rounded px-2 py-0.5">
        not assessed — no evidence found
      </span>
    );
  }
  return (
    <span className="text-sm border border-zinc-800 bg-white rounded px-2 py-0.5 font-mono">
      {score} / {SCORE_MAX}
    </span>
  );
}

function CriterionCard({ criterion }: { criterion: CriterionResultDto }) {
  const notAssessed = criterion.score === null;

  return (
    <li className="border border-zinc-300 bg-white rounded p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{criterion.label}</h3>
        <ScoreBadge score={criterion.score} />
      </div>

      {criterion.anchor ? (
        <p className="text-xs text-zinc-600 italic">{criterion.anchor}</p>
      ) : null}

      {/* Evidence is mandatory on every criterion, scored or not. It is the whole claim
          this product makes: a judgement that cannot point at your words is not shown as
          a judgement. */}
      <div className="text-sm">
        <span className="font-medium text-zinc-700">Evidence: </span>
        {criterion.evidence.trim().length > 0 ? (
          <q className="text-zinc-800">{criterion.evidence}</q>
        ) : (
          <span className="text-zinc-600">
            No supporting quote was produced for this criterion, so it was not scored.
          </span>
        )}
      </div>

      <div className="text-sm">
        <span className="font-medium text-zinc-700">Concern: </span>
        {criterion.concern.trim().length > 0 ? (
          <span className="text-zinc-800">{criterion.concern}</span>
        ) : (
          <span className="text-zinc-600">
            {notAssessed
              ? 'This criterion could not be assessed from the submission as written.'
              : 'Nothing outstanding at this level.'}
          </span>
        )}
      </div>

      <div className="text-sm">
        <span className="font-medium text-zinc-700">Suggestion: </span>
        {criterion.suggestion.trim().length > 0 ? (
          <span className="text-zinc-800">{criterion.suggestion}</span>
        ) : (
          <span className="text-zinc-600">
            Write this section out explicitly so it can be assessed next time.
          </span>
        )}
      </div>

      {!notAssessed ? (
        <p className="text-xs text-zinc-500">
          Weight {Math.round(criterion.weight * 100)}% · evaluator confidence{' '}
          {criterion.confidence.toFixed(2)}
        </p>
      ) : null}
    </li>
  );
}

export function Feedback({
  attempt,
  onRetry,
  retrying,
}: {
  attempt: AttemptDto;
  onRetry: () => void;
  retrying: boolean;
}) {
  const evaluation = attempt.evaluation;
  const scored = attempt.criteria.filter((c) => c.score !== null).length;

  return (
    <section className="space-y-4">
      <div className="border border-zinc-300 bg-white rounded p-3 space-y-1">
        {/* Named apart from the structural checks above on purpose: these ARE scores,
            those are measurements, and conflating them is the failure mode. */}
        <h2 className="font-medium">Rubric criteria (AI evaluation)</h2>
        <p className="text-sm text-zinc-700">
          {scored} of {attempt.criteria.length} criteria were scored
          {evaluation ? ` (run ${evaluation.runNumber}, outcome ${evaluation.outcome})` : ''}.
        </p>
        <p className="text-sm text-zinc-700">
          {/* No single 0-100 grade anywhere, by design — the Evaluation record has no
              global score field, so the anti-pattern is unrepresentable, not merely
              discouraged. This is a weighted mean over the criteria that WERE scored. */}
          Weighted average over assessed criteria:{' '}
          {evaluation && evaluation.overall.weighted !== null ? (
            <span className="font-mono">
              {evaluation.overall.weighted.toFixed(1)} / {SCORE_MAX}
            </span>
          ) : (
            <span className="text-zinc-600">
              not reported — fewer than three criteria were scored, and averaging one or
              two dimensions would be false precision
            </span>
          )}
        </p>
      </div>

      {attempt.status === 'FAILED' ? (
        <div className="border border-amber-400 bg-amber-50 rounded p-3 space-y-2">
          <p className="text-sm">
            <span className="font-medium">The evaluation did not complete.</span> Your
            submission is stored and unchanged — anything below was still produced, and
            you do not need to re-type your design.
          </p>
          {attempt.failureReason ? (
            <p className="text-xs font-mono text-zinc-700 break-words">
              {attempt.failureReason}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying || !attempt.canRetryEvaluation}
            className="border border-zinc-800 bg-zinc-900 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
          >
            {retrying ? 'Re-running…' : 'Re-run evaluation'}
          </button>
        </div>
      ) : null}

      <ul className="space-y-3">
        {attempt.criteria.map((criterion) => (
          <CriterionCard key={criterion.criterionKey} criterion={criterion} />
        ))}
      </ul>
    </section>
  );
}
