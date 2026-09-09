'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { HistoryDto } from '@/app/api/_lib/dto';
import { getLearnerId } from '../_lib/learner';

const DIRECTION_LABEL: Record<HistoryDto['movements'][number]['direction'], string> = {
  IMPROVED: 'improved',
  REGRESSED: 'regressed',
  FLAT: 'no change',
  UNKNOWN: 'not comparable yet',
};

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Screen 5 — per-criterion score movement between attempts.
 *
 * This is a product requirement, not decoration. A list of past overall scores tells a
 * learner they got better; it does not tell them WHICH dimension is stuck, which is the
 * whole claim the platform makes over "ask a chatbot again". `GetHistory` already
 * computes the steps, the delta and the direction, so this screen renders them and adds
 * no arithmetic of its own.
 *
 * Two rules inherited from the domain and visible here:
 *  - a criterion with no score in an attempt is a GAP in the line, never a zero;
 *  - a trend is never drawn across a rubric version boundary. Attempts scored under an
 *    older ruler are listed as excluded rather than quietly averaged in.
 */
function HistoryView() {
  const searchParams = useSearchParams();
  const problemId = searchParams.get('problemId') ?? '';

  const [history, setHistory] = useState<HistoryDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (problemId.length === 0) {
      setError('No problemId given. Open history from a problem page.');
      return;
    }
    const learnerId = getLearnerId();
    void (async () => {
      try {
        const response = await fetch(
          `/api/history?learnerId=${encodeURIComponent(learnerId)}&problemId=${encodeURIComponent(problemId)}`,
          { cache: 'no-store' },
        );
        const body = (await response.json()) as HistoryDto & { message?: string };
        if (!response.ok) throw new Error(body.message ?? `Request failed (${response.status})`);
        setHistory(body);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, [problemId]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!history) return <p className="text-sm text-zinc-600">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/problems/${history.problem.slug}`} className="text-sm">
          ← {history.problem.title}
        </Link>
        <h1 className="text-xl font-semibold mt-2">Your attempts</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Learner <span className="font-mono">{history.learnerId}</span> · rubric version{' '}
          {history.rubricVersion}
        </p>
      </div>

      {history.attempts.length === 0 ? (
        <p className="text-sm">
          No attempts yet.{' '}
          <Link href={`/problems/${history.problem.slug}`}>Start one</Link>.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="font-medium">Attempts</h2>
            <ul className="space-y-1 text-sm">
              {history.attempts.map((attempt) => (
                <li key={attempt.attemptId}>
                  <Link href={`/attempts/${attempt.attemptId}`}>
                    Attempt {attempt.attemptNumber}
                  </Link>{' '}
                  <span className="font-mono text-xs border border-zinc-300 rounded px-1">
                    {attempt.status}
                  </span>{' '}
                  <span className="text-zinc-600">
                    {attempt.overallWeighted !== null
                      ? `weighted ${attempt.overallWeighted.toFixed(1)} / 4`
                      : 'no overall reported'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-medium">Movement per criterion</h2>
            <ul className="space-y-3">
              {history.movements.map((movement) => (
                <li
                  key={movement.criterionKey}
                  className="border border-zinc-300 bg-white rounded p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">{movement.label}</h3>
                    <span className="text-sm">
                      {movement.delta === null ? (
                        <span className="text-zinc-600">{DIRECTION_LABEL.UNKNOWN}</span>
                      ) : (
                        <span className="font-mono">
                          {signed(movement.delta)} overall ({DIRECTION_LABEL[movement.direction]})
                        </span>
                      )}
                    </span>
                  </div>

                  <p className="text-sm">
                    <span className="text-zinc-600">Scores: </span>
                    {movement.points.length === 0 ? (
                      <span className="text-zinc-600">
                        never scored on this criterion yet
                      </span>
                    ) : (
                      <span className="font-mono">
                        {movement.points
                          .map((point) => `#${point.attemptNumber}: ${point.score}`)
                          .join('   ')}
                      </span>
                    )}
                  </p>

                  {movement.steps.length > 0 ? (
                    <ul className="text-sm space-y-0.5">
                      {movement.steps.map((step) => (
                        <li key={`${step.fromAttemptNumber}-${step.toAttemptNumber}`}>
                          <span className="font-mono">
                            #{step.fromAttemptNumber} → #{step.toAttemptNumber}:{' '}
                            {step.from} → {step.to} ({signed(step.change)})
                          </span>{' '}
                          <span className="text-zinc-600">
                            {step.change > 0
                              ? 'improved'
                              : step.change < 0
                                ? 'regressed'
                                : 'held'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-zinc-600">
                      Two comparable attempts are needed before movement can be shown.
                    </p>
                  )}

                  {movement.isRecurringWeakness ? (
                    <p className="text-sm border border-amber-400 bg-amber-50 rounded p-2">
                      Recurring weakness: scored 1 or lower in at least two of your last
                      three completed attempts. This is the dimension to work on next.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          {history.excludedAttemptIds.length > 0 ? (
            <p className="text-xs text-zinc-600">
              {history.excludedAttemptIds.length} attempt(s) were scored under a different
              rubric version and are excluded from the movement above. Comparing across
              rulers would make the numbers meaningless.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-600">Loading…</p>}>
      <HistoryView />
    </Suspense>
  );
}
