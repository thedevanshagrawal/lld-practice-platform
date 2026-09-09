# Research Note: Practising Low Level Design

**Devansh Agrawal** | CipherSchools Hiring Assignment | September 2026

---

## 1. The learner problem

A learner sits down with "design a parking lot". After forty minutes they have `ParkingLot`, `ParkingSpot`, `Vehicle`, `Ticket`, and a `PaymentProcessor`. It looks reasonable. Then comes the part nobody has solved for them: is it actually any good?

They open a reference solution. It has a `SpotAllocationStrategy` interface and a separate `PricingPolicy`. Theirs doesn't. Did they miss something important, or did that author just make a different call for a system under different pressures? Their `ParkingLot` handles allocation, pricing, and payment. Is that a single responsibility violation, or is it fine at this size? Both answers are defensible, and a reference solution never tells you which one applies to what you wrote.

This is what separates LLD from DSA practice. On LeetCode there is a green tick, and the learner needs no judgement of their own to know where they stand. In LLD there is no answer key, because two valid designs can look completely different and both be correct. So the learner ends up grading their own work using the exact judgement they came here to build.

Two things make it worse. You cannot see the coupling you created, because you created it and it felt natural at the time. And without feedback that persists, the same mistake repeats: a learner who piles too much behaviour onto one orchestrator class in Parking Lot does it again in Elevator, and again in Vending Machine, and never notices, because every attempt is judged in isolation.

Sadler (1989) frames feedback as information that closes the gap between a learner's current state and the desired state. The problem in LLD is that the desired state was never made explicit. It cannot be a solution. It has to be a set of qualities.

---

## 2. Existing approaches

I looked at eight ways a learner can practise LLD today.

| Platform | Submission | Evaluation | Design quality judged? | Progress tracking |
| --- | --- | --- | --- | --- |
| Educative.io | In-browser playground | Guided reading, self-assessment | Minimal | Course % only |
| Design Gurus | Text reader | None, fully self-assessed | No | Chapter checkmarks |
| Exercism.org | Full source code | Test runners, AST analysers, human mentors | Yes, for language idioms | Strong: versioned iterations with diffs |
| LeetCode (OOD) | Fixed method signatures | Black-box input/output tests | No | Submission log |
| InterviewBit | Editor or reading | I/O tests for code, none for design | No | Streaks and points |
| GitHub reference repos | None, clone and read | Self-directed | No | None |
| ChatGPT / Gemini ad-hoc | Free-form chat | Unstructured critique | Partial | None |
| Hello Interview | Browser IDE and canvas | Rubric-based AI, tuned by interviewers | Yes | Readiness view |
| Coudo AI | Browser IDE | Rubric-based AI code review | Yes | Retired, absorbed into Hello Interview |

Three patterns come out of this. The course platforms are very good at showing you a good design and useless at telling you anything about yours. LeetCode-style automation grades behaviour, not structure, so a god class with correct outputs still scores full marks, which quietly teaches the opposite of what LLD practice is for. Exercism is the only one that gets the learning loop right, with versioned attempts and side-by-side diffs, but it targets language idioms rather than design, and its best feedback comes from human mentors, which is slow and varies by mentor.

The most interesting finding is not a feature. Coudo AI, a standalone LLD practice product with AI code review, has retired, and its problems and AI feedback now sit inside Hello Interview. The company building closest to rubric-driven LLD evaluation did not survive on its own.

---

## 3. The gap

Every option gives a learner one of two things. Either a reference solution, which implies there is one right answer and says nothing about the design in front of it, or unstructured AI opinion, which is inconsistent between runs, tends to agree with whatever you wrote, and forgets you the moment the tab closes.

Nothing gives rubric-anchored, evidence-backed feedback that persists across attempts. That combination is the gap: named dimensions instead of an answer key, feedback that quotes the learner's own words back, and a record that lasts long enough for a recurring weakness to become visible.

---

## 4. Product direction

**The loop.** Pick a problem, write a design, submit, get per-criterion feedback with evidence, revise, submit again, and see what moved. The unit of value is not the score at the end. It is the difference between attempt one and attempt two.

**Dimensions, not an answer key.** Because two valid designs look different, the system never compares a submission against a stored solution. It scores five named criteria: requirement understanding and assumptions, class responsibilities and decomposition, coupling and cohesion, abstraction and interfaces, and extensibility under a new requirement. Each result carries a score, the evidence it rests on, the concern, and one suggested next step. That maps onto Hattie and Timperley (2007), "The Power of Feedback", who describe useful feedback as answering three questions: where am I going, how am I going, where to next. The rubric answers the first, the score plus evidence the second, the suggestion the third. Storing feedback per criterion instead of as one narrative blob is what makes all three visible at once.

Evidence is mandatory. A criterion score with no quotation from the learner's own submission does not get shown. That is the guard against generic AI review, and it keeps feedback about the design that was actually written.

**Structured text as the submission format, and what it costs.** The learner fills in defined sections: assumptions, classes with a one-line responsibility and key methods each, relationships between them, and trade-offs. This is the smallest format that still carries real evidence of design quality, and its structure is what makes rubric scoring possible at all. Free text gives the evaluator nothing to anchor to, which is how you end up with a number that means nothing.

It gives up real things, and I would rather name them than pretend otherwise. It cannot show concurrency behaviour, so thread safety is deliberately left out of the v1 rubric rather than guessed at, and it cannot prove the design compiles or that the interfaces line up. Code or a class diagram would carry more evidence, and both are planned as later submission types, which is why the domain treats submission content as an interface from day one.

**History over a single score.** A one-shot score is a verdict. What a learner needs is movement per criterion across attempts, so that "coupling scored low on three problems in a row" becomes a visible fact instead of a vague feeling. Exercism's versioned iteration history is the model here. This is the feature that turns the product from an assessor into a practice tool.

**Deterministic checks before the LLM.** Two evaluators run behind one interface. The deterministic one handles anything that is a fact: sections present, at least three classes, every class has a responsibility line, no single class carrying an unreasonable number of methods. The LLM handles only judgement: is this responsibility split sensible, is this abstraction earned, would this design survive a new requirement. The split keeps the model off questions it answers unreliably, and it means a timeout degrades to partial feedback rather than none.

**The honest strategic question.** Coudo AI's retirement suggests rubric-anchored LLD feedback has real value but is hard to sustain as a destination of its own. It looks more like a feature of something bigger than a standalone business. For CipherSchools that reads as useful rather than discouraging. The existing business is creator-led video learning, bootstrapped since 2020, with learners already sitting inside a course. So this should be a practice layer on top of that content: a learner finishes an OOP or design module, immediately designs something, gets scored on it, and their attempt history sits next to their course progress. The thing Coudo AI lacked, a reason for the learner to be on the platform in the first place, is the part CipherSchools already owns.
