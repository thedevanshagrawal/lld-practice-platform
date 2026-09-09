'use client';

import { useEffect, useState } from 'react';
import { getLearnerId, learnerDisplayName, setLearnerName } from '../_lib/learner';

/** The whole of "identity" in this MVP: a name field in the header. See _lib/learner.ts. */
export function LearnerBar() {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(learnerDisplayName(getLearnerId()));
  }, []);

  return (
    <form
      className="flex items-center gap-2 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        setLearnerName(name);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1500);
      }}
    >
      <label htmlFor="learner-name" className="text-zinc-600">
        Your name
      </label>
      <input
        id="learner-name"
        className="border border-zinc-300 px-2 py-1 rounded"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="anonymous"
      />
      <button type="submit" className="border border-zinc-400 px-2 py-1 rounded">
        Save
      </button>
      <span aria-live="polite" className="text-zinc-500">
        {saved ? 'saved' : ''}
      </span>
    </form>
  );
}
