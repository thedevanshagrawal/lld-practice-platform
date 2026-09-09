'use client';

import { useRef, useState } from 'react';

export interface ClassRow {
  name: string;
  responsibility: string;
  methods: string;
}

const EMPTY_ROW: ClassRow = { name: '', responsibility: '', methods: '' };

/**
 * Screen 3 — THE SUBMISSION FORM. Exactly four fields, and this is the locked format:
 *
 *   assumptions    free text, one per line
 *   classes        repeatable rows: name, one-line responsibility, key methods
 *   relationships  free text, one per line
 *   trade-offs     free text, one per line
 *
 * No code editor and no diagram input, on purpose. A code editor would turn this into a
 * coding exercise and the rubric would start scoring syntax; a diagram input would need
 * a parser before it could produce a single fact the evaluator can quote. Structured
 * text is the format where every rubric criterion is answerable from what the learner
 * actually wrote — and where "evidence must be a quote" is even possible.
 */
export function SubmissionForm({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (payload: {
    assumptions: string;
    classes: ClassRow[];
    relationships: string;
    tradeOffs: string;
    idempotencyKey: string;
  }) => void;
  busy: boolean;
  error: string | null;
}) {
  const [assumptions, setAssumptions] = useState('');
  const [classes, setClasses] = useState<ClassRow[]>([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]);
  const [relationships, setRelationships] = useState('');
  const [tradeOffs, setTradeOffs] = useState('');

  /**
   * Generated once per form, not per click. A learner who submits, loses the connection
   * and presses the button again must produce ONE submission, not two — that is what the
   * idempotency key on SubmitAttempt is for, and it only works if the key is stable.
   */
  const idempotencyKey = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `key-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );

  function updateRow(index: number, patch: Partial<ClassRow>) {
    setClasses((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          assumptions,
          classes,
          relationships,
          tradeOffs,
          idempotencyKey: idempotencyKey.current,
        });
      }}
    >
      <fieldset className="space-y-2">
        <label htmlFor="assumptions" className="block font-medium">
          1. Assumptions
        </label>
        <p className="text-xs text-zinc-600">
          One per line. The statement leaves things open on purpose — close them here.
        </p>
        <textarea
          id="assumptions"
          rows={5}
          className="w-full border border-zinc-300 rounded p-2 text-sm font-mono"
          value={assumptions}
          onChange={(event) => setAssumptions(event.target.value)}
          placeholder={'Payment is always successful; failed payments are out of scope.\nOne vehicle occupies exactly one slot.'}
        />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-medium">2. Classes</legend>
        <p className="text-xs text-zinc-600">
          One row per class: a name, a single-sentence responsibility, and the key
          methods (comma separated).
        </p>
        <div className="space-y-2">
          {classes.map((row, index) => (
            <div
              key={index}
              className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)_auto] items-start border border-zinc-200 bg-white rounded p-2"
            >
              <input
                aria-label={`Class ${index + 1} name`}
                className="border border-zinc-300 rounded p-2 text-sm"
                placeholder="ParkingLot"
                value={row.name}
                onChange={(event) => updateRow(index, { name: event.target.value })}
              />
              <input
                aria-label={`Class ${index + 1} responsibility`}
                className="border border-zinc-300 rounded p-2 text-sm"
                placeholder="Knows the floors and finds a slot that fits a vehicle."
                value={row.responsibility}
                onChange={(event) => updateRow(index, { responsibility: event.target.value })}
              />
              <input
                aria-label={`Class ${index + 1} key methods`}
                className="border border-zinc-300 rounded p-2 text-sm font-mono"
                placeholder="findSlot, park, unpark"
                value={row.methods}
                onChange={(event) => updateRow(index, { methods: event.target.value })}
              />
              <button
                type="button"
                aria-label={`Remove class ${index + 1}`}
                className="border border-zinc-300 rounded px-2 py-2 text-sm"
                onClick={() => setClasses((rows) => rows.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="border border-zinc-400 rounded px-2 py-1 text-sm"
          onClick={() => setClasses((rows) => [...rows, { ...EMPTY_ROW }])}
        >
          Add class
        </button>
      </fieldset>

      <fieldset className="space-y-2">
        <label htmlFor="relationships" className="block font-medium">
          3. Relationships
        </label>
        <p className="text-xs text-zinc-600">
          One per line, in the form{' '}
          <code>From -&gt; To [COMPOSITION] : optional note</code>. The kind and note are
          optional; a line without an arrow is still kept.
        </p>
        <textarea
          id="relationships"
          rows={5}
          className="w-full border border-zinc-300 rounded p-2 text-sm font-mono"
          value={relationships}
          onChange={(event) => setRelationships(event.target.value)}
          placeholder={'ParkingLot -> Floor [COMPOSITION] : a lot owns its floors\nFeeCalculator <- HourlyFee [IMPLEMENTS]'}
        />
      </fieldset>

      <fieldset className="space-y-2">
        <label htmlFor="tradeoffs" className="block font-medium">
          4. Trade-offs
        </label>
        <p className="text-xs text-zinc-600">
          One per line. What did you choose against, and what does your choice cost?
        </p>
        <textarea
          id="tradeoffs"
          rows={5}
          className="w-full border border-zinc-300 rounded p-2 text-sm font-mono"
          value={tradeOffs}
          onChange={(event) => setTradeOffs(event.target.value)}
          placeholder={'Strategy for fees rather than a switch: more classes, but a new scheme needs no edit to ParkingLot.'}
        />
      </fieldset>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="border border-zinc-800 bg-zinc-900 text-white px-3 py-2 rounded disabled:opacity-50"
      >
        {busy ? 'Submitting…' : 'Submit design'}
      </button>
    </form>
  );
}
