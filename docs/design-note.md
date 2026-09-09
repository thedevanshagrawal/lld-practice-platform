# Design Note: LLD Practice Platform

**Devansh Agrawal** | CipherSchools Hiring Assignment | September 2026
**Companion document:** Research Note (learner problem, landscape, product direction)

---

## 1. MVP scope and the loop

A learner picks a low level design problem, writes their design as structured text, and gets feedback one rubric criterion at a time, every score backed by a quote from their own words. Then they write another attempt and see which criteria moved.

**In:** 4 seeded problems (Parking Lot, Elevator, Vending Machine, Rate Limiter), one submission format, one rubric of 5 criteria, structural checks that carry no score, attempt history with per criterion movement.
**Out:** auth, accounts, admin, problem authoring, code editor, diagram canvas, queues, human review.

1. **Choose a problem.** It carries enumerated `requirements[]` and `constraints[]`, so "did the design address requirement 3?" has an answer.
2. **Design.** Four fields: assumptions; classes, each with a one line responsibility and key methods; relationships with direction; trade-offs and what would change under a new requirement.
3. **Submit.** Persisted, then the request returns. The learner never waits on a model call.
4. **Feedback.** Structural checks first, measured by code, then five judgement criteria, each with a score, evidence, a concern and one next step.
5. **Review.** The two kinds are shown separately, so a learner can tell "the platform counted this" from "the AI judged this".
6. **Retry.** A failed evaluation re-runs without re-submitting. A revised design is a new attempt.
7. **History.** Per criterion movement across attempts, so a recurring weakness becomes a visible fact rather than a feeling.

---

## 2. The classes that matter, and why each earns its place

One rule governs the layer: **`src/domain` contains no import that leaves `src/domain`.** No Next.js, no MongoDB driver, no Gemini SDK, no `process.env`. One grep checks it, and a reviewer will.

| Type | Why it earns its place |
|---|---|
| `Problem` | Enumerated requirements ground the evaluator in something specific. No behaviour. |
| `Criterion` | Data, not a hierarchy. Retuning a weight is a seed edit, not a deploy and a migration. |
| `Rubric` | Carries a `version`, so a trend line cannot compare two different rulers. |
| `Attempt` | The only stateful type, the only real invariant. Owns every status change. |
| `Submission` | Immutable record plus `idempotencyKey`. Separates the work from the verdict. |
| `SubmissionContent` | The format seam. Change Test A, written as an interface with two methods. |
| `StructuralFacts` | Format neutral vocabulary, so code can evaluate without knowing the format. |
| `CriterionResult` | Fixed shape, mandatory `evidence`. The shape is the defence against the anti-pattern. |
| `Evaluation` | One run, with `runNumber`, so a re-run appends and a degraded run stays auditable. |
| `EvaluationPipeline` | Change Test B. Without it this logic lives in a route handler. |
| `Evaluator`, 4 repositories, `Clock`, `IdGenerator` | Contracts only. `Clock` and `IdGenerator` keep the domain pure and make time and id assertions exact. |

Two choices there are deliberate. **`Attempt` is the only type in the domain that owns mutable state**, and it hides it behind a private constructor with `start()` and `rehydrate()` factories, because an `Attempt` constructible in an arbitrary state is not worth having. Almost everything else is a plain interface or a pure function, so a class is earned rather than habitual. And **the state machine is a data table**: `ATTEMPT_TRANSITIONS` holds exactly five legal moves across five states, so one test iterates all 25 ordered pairs and asserts that five pass. `DRAFT -> COMPLETED` is not unlikely, it is unrepresentable.

### Two abstractions I deliberately did not build

**No `Learner` aggregate. `learnerId` is a `string`.** There is no auth; the learner is a name in a field, so a `Learner` entity would own no invariant and protect no consistency boundary. It would exist to look like DDD. The test of whether an omission is safe is whether adding it later forces edits elsewhere, and it does not: `Learner` arrives keyed by the same string and no signature changes. Build it when a learner has state that must stay internally consistent, such as entitlements or a cross problem skill profile.

**No `MergePolicy` or `ResultMerger`.** My first draft had one, because two evaluators could both score class responsibilities and something had to decide precedence: an interface, two implementations, a rule, and tests for the rule. Then I moved criterion ownership into `Criterion.assessedBy`, which is data, and the conflict stopped existing. The pipeline asserts up front that coverage is disjoint and total, and assembly became a concatenation. The abstraction disappeared because the data model changed, not because I resisted writing it.

Also absent: no `SubmissionRepository`, because the submission lives inside the `Attempt` aggregate and that is what makes store-before-evaluate a single write; no `Score` value object; no `AbstractEvaluator` base class; no queue (section 8).

---

## 3. Evaluation: what code decides, what the model decides

**The boundary rule: if a check has one correct answer computable from the text, it never goes to the LLM.** Deterministic checks are free, instant, perfectly consistent, testable without an API key, and they still work when Gemini is down.

| Decided by code | Decided by the model |
|---|---|
| All four sections present | Requirement understanding and assumptions |
| At least three classes named | Class responsibilities and decomposition |
| Every class has a responsibility line | Coupling and cohesion |
| God object heuristic: 7+ listed methods, or one class holding over 40% of them | Abstraction, interfaces, pattern appropriateness |
| Duplicate submission (idempotency key) | Extensibility under a new requirement |
| Legal state transition | |

The clearest line is the responsibility check. Whether a class *has* a responsibility line is a presence check and belongs to code; whether "Ticket, a ticket" is a *meaningful* responsibility is judgement and belongs to the model.

The structural side carries no score and no weight. `DeterministicEvaluator` returns `StructuralFinding[]`, never scores, and it is a pre-flight step consumed inside `GeminiEvaluator` rather than a stage in the pipeline or a criterion in the rubric. The adapter runs it before it builds the prompt, injects the findings as measured facts so the model reconciles with what was already counted instead of counting again, and applies the one override I allow anywhere: a class flagged as a god object caps `responsibilities_and_decomposition` at 3. The findings are also shown on their own above the rubric, which is the trust feature in point 5 of the loop. Completeness is deliberately not a rubric criterion. A method count is a measurement, and giving it a band score would dress it up as a design judgement, which is the one thing this platform exists to avoid. So the rubric is five criteria, every one of them `assessedBy: 'llm'`: requirements and assumptions 0.20, responsibilities and decomposition 0.25, coupling and cohesion 0.20, abstraction and interfaces 0.20, extensibility 0.15.

**No Score Without Evidence.** A score not backed by a verbatim quote from the submission does not get shown. If the model cannot find one it returns `score: null` with evidence beginning `NO EVIDENCE:` and says where it looked, which is better than a fabricated score because it names the section to fill in next time. Three layers enforce it: the prompt states the rule with a worked example; application code substring-matches every quote against the submission and forces that criterion to null if the quote is not really there; and `createCriterionResult` throws on empty evidence, so a malformed response dies at the domain boundary, not in a React component.

Feedback is stored per criterion rather than as one blob because that is what makes it act like feedback. Sadler (1989) describes feedback as closing the gap between a learner's current state and the desired state. Hattie and Timperley (2007) split useful feedback into three questions: where am I going, how am I going, where to next. The criterion anchors answer the first, evidence plus score the second, the suggestion the third, and the concern names the gap.

**Why there is no global score field.** The brief names an unconstrained 100 point score as an anti-pattern, so it is made structurally impossible rather than discouraged. `CriterionResult` has no such field and the response schema has no `overall`, `total` or `grade` property, so the model cannot return one even if it tries. The aggregate is computed in domain code by `computeOverallScore`, which returns `OverallScore { weighted, assessedWeight }` renormalised over scored criteria only, so an unscored dimension does not quietly drag the number down and a partial result cannot be read as a complete one. Below three scored criteria `weighted` is `null` and no overall is reported at all, because averaging two dimensions and calling it a design score is the same false precision as the 100 point number, just wearing a smaller one. It is reported on the same 0 to 4 band range as the criteria, never as a percentage and never as the headline, and it exists to plot movement across attempts. A band has a written definition a learner can act on. "68 out of 100" does not.

---

## 4. Change Test A: today text, tomorrow a class diagram

**How much of the domain changes? Nothing in the core.**

**Added:** `src/domain/content/DiagramContent.ts`, a `class DiagramContent implements SubmissionContent` holding nodes and edges, where `toEvaluationText()` renders the graph as a deterministic listing and `structuralFacts()` maps nodes to `DeclaredClass` and edges to `DeclaredRelationship`. Plus `src/application/content/parseDiagramSubmission.ts` to build one from the UI payload, in the application layer, not the domain.

**Changed, two files.** `SubmissionContent.ts`: `SubmissionContentKind` widens from `'TEXT_DESIGN'` to `'TEXT_DESIGN' | 'DIAGRAM'`, one line. `infrastructure/mongo/SubmissionContentMapper.ts`: one new `case 'DIAGRAM':`, about four lines. That second edit is not something you have to remember, because the switch ends in `default: assertNever(kind)`, so widening the union makes the mapper fail to compile until it is handled. The compiler is the checklist.

**Not changed, which is the point:** `Attempt.ts`, `AttemptStatus.ts`, `Submission.ts`, `Problem.ts`, `Rubric.ts`, `Criterion.ts`, `scoring.ts`, `CriterionResult.ts`, `Evaluation.ts`, `EvaluationPipeline.ts`, `ports/Evaluator.ts`, all four repository ports, `ProgressReport.ts`, both evaluator adapters, and every use case.

**Why it holds.** The system asks a submission exactly two questions, `toEvaluationText()` for anything that reads prose and `structuralFacts()` for anything that counts, and no core type names `TextDesignContent`. `Submission.content` and `EvaluationRequest.content` are both typed `SubmissionContent`. The deterministic rules are written against `StructuralFacts`, so a diagram's nodes flow through "at least three classes" and "no class with eight methods" without one rule being rewritten. The seam cost one interface and roughly fifteen lines, worth paying only because the brief names this change as expected and because it has two customers rather than one: it is also what keeps the deterministic evaluator format agnostic today.

**The honest limit.** A diagram cannot carry prose assumptions or trade-offs, so its `sectionsPresent` reports `['CLASSES', 'RELATIONSHIPS']`, the structural checks raise a missing section finding on every submission of that kind, and requirement understanding has little to read. That is not a bug in the seam, it is the seam telling the truth. The fix is a diagram-appropriate rubric, a second rubric row with different criteria and weights: config, not code, because `Criterion` is data. What would break the claim is a format needing a *third* question, say rendering itself as an image for a side by side diff; I would put that in a rendering adapter keyed on `kind`, outside the domain, rather than widen `SubmissionContent`.

---

## 5. Change Test B: today one AI evaluator, tomorrow rules or a human

**Yes for anything that scores within one request: one adapter file plus one config edit.** Human review is genuinely different, and I answer it separately rather than pretend it fits.

**B1, a rule-based evaluator.** Added: `src/infrastructure/rules/RuleBasedEvaluator.ts`, a `class RuleBasedEvaluator implements Evaluator` with `tag = 'rules'`, reading `request.content.structuralFacts()`. Changed: the rubric seed gains a criterion with `assessedBy: 'rules'` (or moves an existing one off `'llm'`), weights rebalance, `Rubric.version` bumps; and the composition root gains one array entry, `new EvaluationPipeline([det, rules, gemini])`. Not changed: every domain file, both existing evaluators, all four repositories, every use case, the state machine, the UI. `SubmitAttempt` does not know how many evaluators exist, and `Attempt` does not know evaluators exist at all. The safety net is `EvaluationPipeline.assertCoverage(rubric)`, which runs before any evaluator and throws if two claim the same criterion or one is orphaned, so a misconfigured rubric fails loudly at startup rather than quietly at scoring time. That check is worth more than the merge policy would have been, and costs less.

**B2, swapping the model.** `GeminiEvaluator` declares `tag = 'llm'` and `adapter = 'gemini-2.5-flash'`. The tag is a capability, not a vendor, so another provider means one new adapter with the same tag, one line in the composition root, and zero rubric changes, because no criterion mentions Gemini anywhere. The old adapter string stays on historical `Evaluation.contributions`, so "which model produced this score?" is still answerable afterwards.

**B3, human review, where the port stops being the right shape.** `Evaluator.evaluate()` returns a promise a pipeline run awaits, and a human takes days. Writing `HumanReviewEvaluator implements Evaluator` and having it resolve on Thursday would be forcing an unrelated activity into a pattern because the pattern exists, which is what the brief penalises. So I would not. Instead, human review is a **superseding `Evaluation`, not an `Evaluator`**: a `SubmitHumanReview` use case builds results through the same `createCriterionResult` factory, so the reviewer must quote the learner too, assembles an `Evaluation` with `contributions: [{ tag: 'human', adapter: 'reviewer:<id>' }]` and `runNumber = n + 1`, and saves it. `findLatestByAttemptId` already returns the newest run, so the UI shows the human verdict without knowing it is human. Cost: one use case and one form. Not changed: `Attempt`, `AttemptStatus`, `EvaluationPipeline`, the `Evaluator` port, `SubmitAttempt`, `ProgressReport`. The principle: **the port covers anything that can score inside one request, and anything asynchronous over human time is a new evaluation run, not a new evaluator.**

**What would actually force a rewrite:** an evaluator that must read the others' results first, such as a synthesis pass over the five judgement scores. `run()` hands every evaluator the same inputs, so that means threading accumulated outputs into `EvaluationRequest`, an additive optional field plus one loop change. Not a rewrite of the practice flow, but it is the change this design would feel, and I would rather name it than claim the seam is free in every direction.

---

## 6. Why structured text, and what it gives up

Structure is what makes rubric evaluation possible, because an unstructured paragraph gives the model nothing to anchor to, which is how you get the random AI number the brief criticises. It is also what makes deterministic checks possible at all, because free text cannot be counted. What it gives up:

1. **No proof the design compiles or is even coherent.** Nothing verifies that a method named on one class exists on the collaborator calling it.
2. **No concrete interface signatures.** `allocate()` and `allocate(vehicle: Vehicle): Slot` look identical here, and the second is the better design.
3. **No evidence of testability.** Whether the design could actually be unit tested is invisible.
4. **Three rubric dimensions had to be cut**: concurrency and thread safety, error handling, and clean code style. Scoring them off this format produces exactly the confident ungrounded opinion this platform exists to avoid. They return with a code format, and since `Criterion` is data, that is a config row rather than a code change.

Rejected alternatives: code carries the most evidence but costs an editor, a parser and possibly a sandbox, which is most of day two spent on plumbing; a diagram shows relationships but is weak on reasoning, which is the thing being assessed; all three together gives the most evidence and the least time to think.

---

## 7. Reliability

1. **The submission is persisted before evaluation starts.** `Submission` lives inside the `Attempt` aggregate, so this is one `save(attempt)` call and cannot be half applied. There is no `SubmissionRepository` precisely so there is no window where an attempt is `SUBMITTED` with no stored content.
2. **Submit does not block on the LLM.** The route persists, returns `202` with `status: SUBMITTED`, and only then starts the pipeline. The learner's write path never touches Gemini.
3. **Idempotency.** Submit looks up `findByIdempotencyKey(learnerId, key)` first, so a double click produces one attempt rather than two. A duplicate attempt would corrupt history permanently. The `DRAFT -> SUBMITTED` guard is the second line of defence.
4. **`FAILED` is re-runnable without re-submitting.** `FAILED -> EVALUATING` is legal, `FAILED -> SUBMITTED` is not. Retry means re-run, not re-send.
5. **Timeouts and retries live in the adapter, never in the domain**, which has no business knowing about milliseconds. The Gemini adapter owns a 25 second per call timeout, one retry with backoff on timeouts, 429s and 5xx but never on a 400, and a 60 second total budget.

**What the learner sees when Gemini fails.** Not an error page. The deterministic results were computed first, saved, and are displayed. The evaluation is stored with `outcome: 'PARTIAL'`, the attempt is `FAILED`, and the screen says the AI feedback did not complete and the submission is saved, with a Retry evaluation button. `FAILED` means our verdict is incomplete, never your work is gone. If the model returns a score with a quote that is not actually in the submission, that criterion alone is forced to null and flagged while the other four survive, because silently dropping it would make the platform look confident when it was not.

`PARTIAL` and `NOT_EVALUABLE` are kept apart deliberately. An evaluator failure is always `PARTIAL`, whatever caused it. `NOT_EVALUABLE` means the submission itself could not be assessed, a structural blocker with no model call made. Telling a learner with a perfectly good design that their work was not assessable, when the truth is that the model was down, is a different message and a worse one.

---

## 8. Trade-offs, limitations, and the first thing to extract

1. **Fire and forget evaluation is at most once.** A process restart mid run strands an attempt in `EVALUATING`. `findStale` plus `FAILED -> EVALUATING` is a recovery sweep, not a guarantee.
2. **`COMPLETED` is terminal**, so a rubric improvement cannot be applied retroactively. Deliberate, because feedback a learner has read should not change underneath them, but it is a real constraint.
3. **The rubric is not calibrated against human graders.** The bands come from design principles, not a labelled set. Real calibration needs 20 to 30 human scored submissions and is the first post-MVP investment.
4. **Single model, single pass.** No ensemble, no self-consistency voting, so there is run to run variance on borderline 2 versus 3 calls, reduced by `temperature: 0.1` and written band anchors rather than eliminated.
5. **The structural checks are gameable** by padding to three classes with one word responsibilities. That is part of why they carry no weight and are findings rather than a criterion, and `responsibilities_and_decomposition` at 0.25 is where padding gets caught, by a reader that looks at what the responsibility lines actually say. The god object threshold of 7 is likewise a heuristic that produces a flag, never a score.
6. **Evidence verification is substring matching**, so a near verbatim quote with one word changed is rejected. A false rejection costs one criterion; a false acceptance costs the platform's core promise. `confidence` is self reported by the model, so it only de-emphasises a result in the UI and never changes a weight.

**What I would extract first: the queue.** Today the `AttemptStatus` field *is* the job record: `SUBMITTED` means not picked up, `EVALUATING` means in flight and acts as the lock, `FAILED` means retryable, and recovery is a query rather than infrastructure. That is enough for one process, and the brief warns against turning this into a distributed systems project. When in flight runs must survive a deploy, the fire and forget call becomes an enqueue, and the seam is already the right shape: `EvaluationPipeline.run()` takes a `Problem`, a `Rubric` and a `SubmissionContent`, all addressable by id, so the payload is three ids and `RunEvaluation` becomes the worker body unchanged. Second would be a shared port contract test suite run against both the in-memory and the MongoDB repositories, which is the real testing gap today. Third, from the research, Exercism's Representers: normalising a submission by stripping formatting and replacing identifiers, so an identical normalised shape reuses feedback already written. That is the honest answer to feedback consistency and model cost, and it is the one feature that would need submissions to be independently queryable, which is the trigger for the `SubmissionRepository` I chose not to build.
