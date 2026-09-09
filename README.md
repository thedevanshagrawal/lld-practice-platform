# LLD Practice Platform

Practise low level design and get rubric-anchored, evidence-backed feedback that persists across attempts.

A learner picks a problem (Parking Lot, Elevator, Vending Machine, Rate Limiter), writes their design as structured text, and gets feedback one criterion at a time. Every score has to point at a quote from the learner's own words, and if the evaluator cannot find one it returns "not evidenced" instead of guessing. Attempt history then shows per criterion movement, so a recurring weakness becomes visible instead of being re-learned from scratch every time.

**Why it exists:** every option a learner has today gives them either a reference solution, which implies there is one right answer, or unstructured AI opinion, which is inconsistent and forgets you when the tab closes. Two valid LLD designs can look completely different, so this judges against named dimensions rather than an answer key. Full reasoning in `docs/research-note.md` and `docs/design-note.md`.

---

## Quick start

**Prerequisites:** Node.js 20+, npm 10+, a MongoDB instance (local or Atlas), and a Gemini API key.

```bash
git clone <repo-url>
cd lld-practice-platform
npm install

cp .env.example .env.local     # then fill in the two required values
npm run seed                   # seeds the 4 problems and the rubric
npm run dev                    # http://localhost:3000
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes, for AI feedback | Authenticates the Gemini evaluator. Without it the app still runs and still gives deterministic structural feedback; every attempt just ends `FAILED` with a retry button. |
| `MONGODB_URI` | Yes | Connection string. Defaults to `mongodb://localhost:27017/lld-practice`. |
| `MONGODB_DB` | No | Database name override. |

`.env.local` is gitignored. `.env.example` ships with placeholders only, and no key is ever committed.

### Seeding

`npm run seed` writes the 4 problems and the MVP rubric into MongoDB. It is idempotent, so re-running it does not duplicate rows. Problems and rubrics are seed data rather than an admin UI on purpose: `Criterion` is a plain data record, so changing a weight or adding a dimension is a seed edit, not a code change and a migration.

### Tests

```bash
npm test           # everything
npm run test:domain    # the pure domain layer only, sub-second
npm run test:watch
```

**No environment variables are needed to run the tests, and the suite never calls the live Gemini API.** If a test needs `GEMINI_API_KEY` to pass, it is the wrong test. Gemini behaviour is covered by recorded response fixtures under `tests/fixtures/gemini/`, captured once by hand against the live prompt and then committed unedited.

---

## Project structure

```
src/
  domain/           pure TypeScript. Zero imports that leave src/domain.
    Problem.ts, ids.ts, errors.ts
    attempt/        Attempt (aggregate root), AttemptStatus, Submission
    content/        SubmissionContent (interface), TextDesignContent, StructuralFacts
    rubric/         Criterion, Rubric, scoring
    evaluation/     CriterionResult, Evaluation, EvaluationPipeline
    progress/       ProgressReport
    ports/          Evaluator, 4 repositories, Clock, IdGenerator
  application/      use cases: StartAttempt, SubmitAttempt, RunEvaluation, GetHistory
  infrastructure/
    mongo/          repository implementations and the content mapper
    gemini/         GeminiEvaluator, prompt, JSON schema, response validation
    deterministic/  DeterministicEvaluator
    seed/           the 4 problems and the rubric
  app/              Next.js routes and a deliberately plain UI
tests/
  domain/ application/ infrastructure/ fakes/ fixtures/
docs/
  research-note.md  design-note.md
```

The rule that matters: **`src/domain` has no framework imports.** No `next`, no `mongodb`, no `@google/generative-ai`, no `process.env`. That is the claim the design note makes and it is checkable in one command:

```bash
grep -rn "^import" src/domain | grep -v "from '\.\|from \"\."   # prints nothing
```

Architecture, the two change tests, and the evaluation approach are in `docs/design-note.md`.

---

## How the flow works

1. `POST /api/attempts` starts a `DRAFT` attempt for a problem.
2. `POST /api/attempts/:id/submit` validates, persists the submission, moves the attempt to `SUBMITTED`, and **returns immediately**. The learner's write path never touches Gemini.
3. A background call runs the evaluation pipeline: the deterministic evaluator first (always, cannot fail), then the Gemini evaluator for the five judgement criteria. The attempt ends `COMPLETED` or `FAILED`.
4. The UI polls the attempt and renders structural checks, then the criterion rows, then the small overall band.
5. `FAILED` is re-runnable without re-submitting. A revised design is a new attempt.

---

## Deploying

The app runs on Vercel with MongoDB Atlas. Set `GEMINI_API_KEY`, `MONGODB_URI`,
`MONGODB_DB` and `CRON_SECRET`, then run the seed once against Atlas so the four
problems and the rubric exist.

### How evaluation survives serverless

A serverless function can be frozen once it has sent its response, so an un-awaited
promise started after `res.send()` may never run, and it fails silently. Awaiting the
model inside submit is worse, because it puts a network call of up to a minute on the
learner's write path. The handoff is therefore explicit in three steps:

1. Submit persists the submission and returns `202` with an `evaluateUrl`. It never
   touches Gemini.
2. The browser posts to that URL. The browser is the one process nobody can freeze,
   which makes it the real trigger rather than a convenience. It also re-triggers if
   the page is reopened on a `SUBMITTED` attempt, and polls independently so it learns
   the outcome even if the evaluate response never arrives.
3. `GET /api/cron/recover` sweeps anything still stranded, using `findStale` and the
   `FAILED -> EVALUATING` transition the domain already models. No new transition was
   invented for recovery.

`vercel.json` schedules that sweep once a day at 03:00. **Vercel's Hobby plan only
permits daily cron jobs**, so a tighter cadence needs a Pro plan. This is acceptable
because the sweep is the third line of defence, not the first: the client trigger
handles the normal case, reopening the page re-triggers, and a `FAILED` attempt always
carries a "Re-run evaluation" button the learner can press immediately. On Pro, change
the schedule to `*/10 * * * *` and stranded attempts recover within ten minutes instead
of by the next morning.

`CRON_SECRET` guards that endpoint; Vercel Cron sends it as a Bearer token. Leaving it
unset leaves the route open, which is the right default locally. The sweep is
idempotent and only ever re-runs work a learner already asked for, so an open endpoint
costs Gemini calls, not data.

## Limitations

Stated up front, because a README that only lists features is not useful to anyone reviewing this.

1. **No authentication.** The learner id is a hardcoded string with a name field in the UI. There is no login, no session, no authorisation, and anyone can read anyone's attempts. Adding auth later does not disturb the domain, because `learnerId` is already just an id and there is no `Learner` aggregate to rework.
2. **4 problems, seeded.** Parking Lot, Elevator, Vending Machine, Rate Limiter. There is no problem authoring UI and no admin panel.
3. **One submission format.** Structured text only: assumptions, classes with a responsibility and key methods, relationships, trade-offs. No code editor and no diagram input. This is a deliberate scope call, not an oversight, and what it gives up is written out in section 6 of the design note. A second format is an implementation of the existing `SubmissionContent` interface.
4. **The test suite never calls the live Gemini API.** Not once, not behind a flag. Recorded fixtures are deterministic, free and offline, but they cannot detect that the live model's behaviour has drifted. Catching real drift needs periodic manual re-recording, which is out of scope here.
5. **No queue.** Evaluation is a fire and forget background call in the same process, with the `AttemptStatus` field acting as the job record. A process restart mid run strands an attempt in `EVALUATING` until the recovery sweep marks it `FAILED` and it becomes retryable. This is the first thing that would be extracted if the product grew, and the seam is already shaped for it.
6. **MongoDB repositories are not covered by tests.** They are thin mappers, and adding a real or in-memory Mongo to `npm test` would add startup time and an external dependency. The right fix is a shared port contract suite run against both the in-memory and the Mongo implementations, and that is the main testing gap today.
7. **The rubric is not calibrated against human graders.** Band descriptors are written from established design principles, not validated against a labelled set. Expect run to run variance on borderline calls even at `temperature: 0.1`.
8. **No E2E tests, no CI.** One contributor, two days. `npm test` is the contract.

---

## Documents

| File | What it covers |
|---|---|
| `docs/research-note.md` | The learner problem, how eight existing platforms handle it, the gap, and the product direction. |
| `docs/design-note.md` | Scope, the domain model and why each abstraction earns its place, the deterministic/LLM boundary, both change tests, reliability, and limitations. |
| `AI_USAGE.md` | Where AI helped, what it proposed that was rejected, and what a fact-check pass caught. |
