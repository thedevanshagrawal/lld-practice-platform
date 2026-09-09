'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getLearnerId } from '../../_lib/learner';

/**
 * Creates the DRAFT attempt, then navigates to the form. Client-side because the
 * learner id lives in localStorage, which the server cannot see.
 */
export function StartAttemptButton({ problemId }: { problemId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ learnerId: getLearnerId(), problemId }),
      });
      const body = (await response.json()) as { attemptId?: string; message?: string };
      if (!response.ok || !body.attemptId) {
        throw new Error(body.message ?? `Request failed (${response.status})`);
      }
      router.push(`/attempts/${body.attemptId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="border border-zinc-800 bg-zinc-900 text-white px-3 py-2 rounded disabled:opacity-50"
      >
        {busy ? 'Starting…' : 'Start attempt'}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
