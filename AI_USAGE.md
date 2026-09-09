# AI Usage

I used AI throughout this build: Claude for design discussion, code scaffolding and drafting, and Gemini for the landscape research in the research note. This file records the decisions where that mattered, including the ones where the AI suggestion was wrong and I did not take it.

The rule I worked to: **AI is fast at producing plausible structure, and plausible structure is exactly what this assignment penalises.** So every abstraction it proposed had to survive the question "what change would make me want this?", and every fact it produced had to be checked before it went into a document a hiring team reads.

---

## 1. Rejected: a deep `Evaluator` class hierarchy

**Proposed.** An abstract `BaseEvaluator` with a template method, subclassed into `AbstractLLMEvaluator` and `AbstractRuleEvaluator`, with `GeminiEvaluator` and `DeterministicEvaluator` at the leaves. It came with a `PipelineStep` wrapper and per-step `required` / `optional` flags.

**What I did instead.** One interface, `Evaluator`, with two methods' worth of contract and two adapters implementing it directly. No base class, no step wrapper, no flags.

**Why.** The brief's "less impressed by" list names design patterns added only to show pattern knowledge, so a hierarchy needs a reason beyond looking organised. The two adapters share no implementation. A `BaseEvaluator` would have existed to hold a `tag` string field. The `required` / `optional` flag was worse: exactly one behaviour exists today, which is that any evaluator failure produces a partial evaluation and a `FAILED` attempt with the successful results kept. A flag with one possible value is a comment pretending to be code.

The same reasoning killed a `MergePolicy` interface I had already sketched. Two evaluators could both score the same criterion, so something had to decide precedence. Rather than build the strategy, I moved criterion ownership into `Criterion.assessedBy`, which is data, and the conflict stopped existing. That is the version I would defend: the abstraction disappeared because the data model changed.

**When I would build the hierarchy.** Three or more adapters sharing real behaviour, such as a common retry-and-parse helper. Even then a shared function is probably better than a base class.

---

## 2. Rejected: asking Gemini for a single 0 to 100 score

**Proposed.** A prompt ending in "rate this design out of 100 and explain your reasoning", with the number stored on the evaluation.

**What I did instead.** Per criterion scoring against a 4 band analytical rubric, where every score requires a verbatim quote from the learner's submission, and there is no global score field anywhere in the model or the response schema.

**Why.** The brief names "an LLM prompt that simply asks for a 100-point score" as an anti-pattern, and it is right to. A 0 to 100 number from a model is false precision: it is not reproducible between runs, it cannot be defended against a specific line of the submission, and it tells a learner nothing they can act on. "68 out of 100" does not say what to change. "Coupling and cohesion, Developing, because you wrote 'all classes interact with ParkingLot'" does.

I went further than just not asking for it. The response schema has no `overall`, `total` or `grade` property, so the model cannot return one even if it drifts. The aggregate is computed in domain code from the criterion weights, renormalised over criteria that were actually scored, and it is displayed as a small line under the criterion rows rather than as the headline. It exists to plot movement across attempts, which is the one job a single number is genuinely good at.

The "No Score Without Evidence" rule came out of the same decision. If the model cannot quote the learner, it must return `score: null` with an explanation of where it looked. A null is a correct answer. A fabricated one teaches the learner to distrust everything else in the report.

---

## 3. Rejected: a queue and worker for async evaluation

**Proposed.** A job queue with a separate worker process, a `EvaluationJob` entity, retry policies and a dead letter path, so that evaluation is durable and survives restarts.

**What I did instead.** A background call in the same process, with the `AttemptStatus` field acting as the job record. `SUBMITTED` means not picked up, `EVALUATING` means in flight and is also the lock that stops a double run, `FAILED` means retryable. Recovery is a query for stale attempts, not infrastructure.

**Why.** The brief warns against turning this into a distributed systems project, and it is a two day MVP with one contributor. A queue would have added a second process to run, a broker to configure, a new set of failure modes to reason about, and it would have bought durability that nothing currently needs. The real requirement was "submit must not block on the LLM and the learner must not lose work", and persisting the submission before evaluation starts satisfies that on its own.

**What it costs, stated honestly.** A process restart mid run strands an attempt in `EVALUATING` until the recovery sweep marks it `FAILED`, after which the learner can retry. That is a real limitation and it is written in the README and the design note rather than hidden.

**Why I am comfortable deferring it.** The seam is already the right shape. `EvaluationPipeline.run()` takes a problem, a rubric and a submission content, all addressable by id, so the job payload is three ids and the existing `RunEvaluation` use case becomes the worker body unchanged. It is named in both documents as the first thing I would extract if this grew.

---

## 4. Accepted with edits: the JSON output schema

**Proposed.** A response schema for the Gemini call with `criterionKey`, `score`, `feedback` and `suggestion` per criterion. This one was good and it saved me time.

**Two edits I made.**

First, **`evidence` was added and made required**, with a minimum length and a rule that a null score must carry an evidence string beginning `NO EVIDENCE:`. The original schema let the model produce a score with only a narrative justification, which is precisely how you get confident feedback about a design the model half-invented. Making evidence structurally required is what turns "no score without evidence" from a line in a prompt into something enforceable. The application layer then substring-matches every quote against the submission text and forces that one criterion to null if the quote is not really there, and `createCriterionResult` throws on empty evidence, so a bad response dies at the domain boundary.

Second, **`confidence` was added**, so the model can say how well evidenced its own judgement is. It de-emphasises a hedged result in the UI. I deliberately did not let it change the weighting, because a model's self assessment is not a probability and treating it as one would be worse than not having the field.

I also split `feedback` into `concern` and `suggestion`, so that "what is weak" and "what to do next" cannot be collapsed into one vague sentence.

---

## 5. A fact-check pass caught two errors in AI-generated research

The landscape research for the research note was drafted with Gemini. I then spent about half an hour verifying the specific claims before anything went into a PDF. Two of them were wrong, and both would have been embarrassing.

**Error 1: Coudo AI was described as a live product.** It is not. Coudo AI has shut down, and its LLD problems with AI feedback have moved into Hello Interview. The draft listed it as a current competitor alongside Hello Interview as though they were two independent products.

Correcting it turned out to be the most useful thing in the whole research pass. The company building closest to what I am proposing did not survive independently and got absorbed into a broader interview prep platform. That is a real market observation, and it raises the honest question of whether rubric-driven LLD evaluation is a product or a feature of something bigger. It is now the most interesting paragraph in the research note, and it only exists because the claim was checked.

**Error 2: the three feedback questions were attributed to Sadler (1989).** They are Hattie and Timperley (2007), "The Power of Feedback". The correct split is:

| Source | Contribution |
|---|---|
| Sadler (1989) | Feedback closes the gap between the learner's current state and the desired state. |
| Hattie and Timperley (2007) | The three questions: where am I going, how am I going, where to next. |

Both citations are used in the research note and the design note, now attributed correctly. A wrong citation in a hiring assignment is exactly the kind of thing a careful reviewer checks, and it undermines everything else in the document.

The same pass also found one claim I could not verify at all: a named "Evaluate with AI" feature on Educative. Rather than cite something I had not seen, I softened it to a general statement about Educative being primarily guided reading with limited automated design evaluation. If I cannot open the source, it does not get named.

---

## What AI was not used for

I wrote the rubric band descriptors myself. They are the part of this system that encodes an opinion about what good design looks like, and an AI-written rubric graded by an AI is a closed loop with nothing anchoring it to anything. The same goes for the deterministic/LLM boundary and the decision to cut three rubric dimensions the submission format cannot honestly evidence. Those are judgement calls, and if I could not defend them in an interview they should not be in the submission.
