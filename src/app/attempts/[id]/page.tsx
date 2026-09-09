'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import type { AttemptDto } from '@/app/api/_lib/dto';
import { Feedback } from './Feedback';
import { StructuralChecks } from './StructuralChecks';
import { SubmissionForm, type ClassRow } from './SubmissionForm';

const POLL_INTERVAL_MS = 2500;

const STATUS_COPY: Record<string, string> = {
  DRAFT: 'Draft — not submitted yet.',
  SUBMITTED: 'Submitted. Your design is stored. Starting evaluation…',
  EVALUATING: 'Evaluating. This usually takes 5–15 seconds.',
  COMPLETED: 'Evaluation complete.',
  FAILED: 'Evaluation incomplete. Your submission is safe and the run can be repeated.',
};

/**
 * Screens 3 and 4 in one route: the form before submit, the status and per-criterion
 * feedback after.
 *
 * It is also where the Vercel async problem is actually solved in practice. See the long
 * comment in src/app/api/attempts/[id]/submit/route.ts for the reasoning; the client half
 * is `triggerEvaluation()` below — the browser is the one process in this system that
 * nobody can freeze, so it is the reliable trigger.
 */
export default function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [attempt, setAttempt] = useState<AttemptDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  /** Stops the same attempt being kicked off twice by a re-render or a fast poll. */
  const triggered = useRef(false);

  const refresh = useCallback(async (): Promise<AttemptDto | null> => {
    const response = await fetch(`/api/attempts/${id}`, { cache: 'no-store' });
    const body = (await response.json()) as AttemptDto & { message?: string };
    if (!response.ok) {
      setLoadError(body.message ?? `Could not load attempt (${response.status})`);
      return null;
    }
    setLoadError(null);
    setAttempt(body);
    return body;
  }, [id]);

  const triggerEvaluation = useCallback(async () => {
    // The evaluate call can take the evaluator's full 60 s budget. It is deliberately
    // NOT awaited for the purposes of the UI: polling below is what reports progress,
    // and a 409 here just means something else already holds the EVALUATING lock.
    try {
      await fetch(`/api/attempts/${id}/evaluate`, { method: 'POST' });
    } catch {
      // A dropped connection is survivable: the attempt is either already finished on
      // the server, or it is stale and the scheduled recovery sweep will re-run it.
    }
    void refresh();
  }, [id, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while the attempt is in flight. Stops on COMPLETED and FAILED, which are the
  // two states where there is nothing further to wait for.
  useEffect(() => {
    if (!attempt?.isEvaluating) return;
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [attempt?.isEvaluating, refresh]);

  // A submission that was never picked up (closed tab, failed trigger) is nudged once
  // when the page is reopened, rather than waiting for the cron sweep.
  useEffect(() => {
    if (attempt?.status === 'SUBMITTED' && !triggered.current) {
      triggered.current = true;
      void triggerEvaluation();
    }
  }, [attempt?.status, triggerEvaluation]);

  async function submit(payload: {
    assumptions: string;
    classes: ClassRow[];
    relationships: string;
    tradeOffs: string;
    idempotencyKey: string;
  }) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch(`/api/attempts/${id}/submit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': payload.idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Submit failed (${response.status})`);
      }

      // 202 accepted. The submission is persisted; nothing has called Gemini yet.
      // Trigger evaluation from here, which is the step that makes the async work
      // actually happen on a platform that can freeze a function after it responds.
      triggered.current = true;
      await refresh();
      void triggerEvaluation();
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function retry() {
    setRetrying(true);
    try {
      await triggerEvaluation();
    } finally {
      setRetrying(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-700">{loadError}</p>
        <Link href="/" className="text-sm">
          ← All problems
        </Link>
      </div>
    );
  }

  if (!attempt) {
    return <p className="text-sm text-zinc-600">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/problems/${attempt.problem.slug}`} className="text-sm">
          ← {attempt.problem.title}
        </Link>
        <h1 className="text-xl font-semibold mt-2">
          Attempt {attempt.attemptNumber}
        </h1>
        <p className="text-sm text-zinc-700 mt-1" aria-live="polite">
          <span className="font-mono border border-zinc-400 rounded px-1.5 py-0.5 text-xs mr-2">
            {attempt.status}
          </span>
          {STATUS_COPY[attempt.status] ?? ''}
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          <Link href={`/history?problemId=${attempt.problem.id}`}>
            History for this problem
          </Link>
        </p>
      </div>

      {attempt.status === 'DRAFT' ? (
        <SubmissionForm onSubmit={submit} busy={submitting} error={submitError} />
      ) : (
        <>
          {/* Always rendered on a submitted attempt, in every status. On a FAILED
              attempt with no criterion results this is the only feedback there is. */}
          <StructuralChecks findings={attempt.structuralFindings} />

          {attempt.isEvaluating ? (
            <p className="text-sm border border-zinc-300 bg-white rounded p-3">
              Waiting for the AI evaluation to finish. This page refreshes itself; you
              can leave and come back.
            </p>
          ) : (
            <Feedback attempt={attempt} onRetry={retry} retrying={retrying} />
          )}

          {attempt.submittedText ? (
            <details className="border border-zinc-300 bg-white rounded p-3">
              <summary className="text-sm font-medium cursor-pointer">
                Your submission, exactly as the evaluator read it
              </summary>
              <pre className="text-xs whitespace-pre-wrap mt-2 text-zinc-800">
                {attempt.submittedText}
              </pre>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
