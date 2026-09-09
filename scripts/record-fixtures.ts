/**
 * record-fixtures — build, verify and (optionally) re-record the Gemini fixtures in
 * `tests/fixtures/gemini/`.
 *
 * WHY THIS EXISTS
 * ---------------
 * A fixture recorded under one prompt is not evidence about a different prompt. The
 * prompt WILL change — that is the point of a changelog — and the moment it does, the
 * committed fixtures silently start testing a prompt that no longer ships. This script
 * makes re-recording a single command so that "re-record after the prompt is final" is
 * a thing someone actually does rather than a line in a plan.
 *
 * It also enforces the property the whole fixture set depends on: every evidence quote
 * in a response fixture is a REAL substring of the paired submission's rendered text.
 * A fixture with an invented quote would make the evidence-verification tests pass
 * against a lie.
 *
 * RUNNING IT (one command, from the repository root; the repo has esbuild but no TS runner)
 * ----------------------------------------------------------------------------------------
 *   npx esbuild scripts/record-fixtures.ts --bundle --platform=node --format=cjs --tsconfig=tsconfig.json --outfile=node_modules/.cache/record-fixtures.cjs && node node_modules/.cache/record-fixtures.cjs --verify
 *
 * Worth adding to package.json as `"fixtures": "..."` when someone owns that file.
 *
 * MODES
 *   --verify   (default) check fixtures without writing. Non-zero exit on any problem.
 *   --build    derive `rawText` from `parsed`/`basedOn`, then verify, then write back.
 *              No network. This is what you run after hand-editing a fixture.
 *   --record   call the LIVE Gemini API for each submission fixture, overwrite `parsed`
 *              and `rawText` with what the model actually said, then verify.
 *              Requires GEMINI_API_KEY. This is the ONLY code path in the repository
 *              that hits the live API; nothing under tests/ ever does.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { TextDesignContent } from '@/domain/content/TextDesignContent';
import type { TextDesignSections } from '@/domain/content/TextDesignContent';
import type { Problem } from '@/domain/Problem';
import type { Criterion, Score } from '@/domain/rubric/Criterion';

import { DeterministicEvaluator, renderDeterministicFacts } from '@/infrastructure/evaluators/DeterministicEvaluator';
import { GENERATION_CONFIG, PROMPT_VERSION, buildEvaluationPrompt } from '@/infrastructure/evaluators/prompt';
import { buildAjvSchema, buildGeminiResponseSchema } from '@/infrastructure/evaluators/responseSchema';
import type { RawEvaluationResponse } from '@/infrastructure/evaluators/responseSchema';
import { salvageJson } from '@/infrastructure/evaluators/salvageJson';
import { verifyEvidence } from '@/infrastructure/evaluators/verifyEvidence';
import { GoogleGenerativeAIClient, DEFAULT_GEMINI_MODEL } from '@/infrastructure/evaluators/GeminiClient';

import Ajv2020 from 'ajv/dist/2020';

// ---------------------------------------------------------------------------
// Fixture directory. Relative to the repo root, because the script is bundled by
// esbuild before it runs and a bundle's __dirname points at the build output, not
// at this file. Run the command from the repo root.
// ---------------------------------------------------------------------------
const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'gemini');

if (!existsSync(FIXTURE_DIR)) {
  console.error(`No fixture directory at ${FIXTURE_DIR}. Run this from the repository root.`);
  process.exit(1);
}

type Envelope = 'plain' | 'fenced-with-prose' | 'truncated';

interface SubmissionFixture {
  fixtureId: string;
  kind: 'submission';
  problemSlug: string;
  sections: TextDesignSections;
  [k: string]: unknown;
}

interface ResponseFixture {
  fixtureId: string;
  kind: 'response' | 'malformed-response';
  promptVersion: string;
  model?: string;
  recordedBy?: string;
  recordedAt?: string | null;
  submissionFixture?: string;
  criterionKeys?: string[];
  envelope?: Envelope;
  basedOn?: string;
  rawText: string | null;
  parsed: unknown;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// The rubric used for recording. Keys come from RUBRIC_AND_EVALUATION.md.
//
// Deliberately local to this script rather than imported from a seed module: the script
// must be able to record against a candidate rubric before that rubric is seeded, and
// the evaluator itself builds its schema from whatever rubric it is handed, so nothing
// downstream depends on these strings. If the seeded rubric uses different keys, change
// them HERE and re-record — the evaluator needs no edit.
// ---------------------------------------------------------------------------
const RECORDING_CRITERIA: readonly Criterion[] = [
  criterion('requirements_and_assumptions', 'Requirement Understanding & Assumptions', 0.2,
    'Read the assumptions and clarifying questions against the problem statement. Reward assumptions that close a real ambiguity, explicit scope boundaries, and questions whose answers would change the design. An assumption contradicted by the class list is worse than no assumption.'),
  criterion('responsibilities_and_decomposition', 'Class Responsibilities & Decomposition (SRP)', 0.25,
    'Read each class name, its one-line responsibility and its key methods together. Does the responsibility describe one job or hide two behind "and"? Do the methods fit it? Is the decomposition domain-shaped or layer-shaped? Is an implied collaborator missing? Is a responsibility line vacuous?'),
  criterion('coupling_and_cohesion', 'Coupling & Cohesion', 0.2,
    'Read the relationships section plus method signatures for what each class must know about. Are dependencies directed and justified, or is there an undirected hub? Do methods reach two levels deep? Is behaviour grouped with the data it acts on? Is bidirectional coupling justified?'),
  criterion('abstraction_and_interfaces', 'Abstraction, Interfaces & Pattern Appropriateness', 0.2,
    'Every abstraction must be earned. Penalise patternitis exactly as hard as missing abstraction. Is there an interface where the problem has more than one plausible implementation? Is there an abstraction with one implementation and no stated reason to expect a second? Are named patterns tied to a problem force or name-dropped?'),
  criterion('extensibility', 'Extensibility Under a New Requirement', 0.15,
    'Judge the "what would you change if requirement X arrived" section as concrete change-impact analysis, not a promise. Does the learner name which classes change, which are added, and which stay untouched? Is the blast radius consistent with the relationships described earlier? Is a cost acknowledged?'),
];

function criterion(key: string, label: string, weight: number, guidance: string): Criterion {
  return {
    key,
    label,
    weight,
    guidance,
    assessedBy: 'llm',
    anchors: {
      0: '',
      1: 'Novice — dimension absent, or handled in a way that would not survive review.',
      2: 'Developing — attempted, with a specific structural weakness.',
      3: 'Proficient — solid and defensible; what a competent engineer produces.',
      4: 'Exemplary — deliberate and explicitly reasoned, not accidental.',
    } as Readonly<Record<Score, string>>,
  };
}

const PARKING_LOT_PROBLEM: Problem = {
  id: 'problem-parking-lot',
  slug: 'parking-lot',
  title: 'Parking Lot',
  statement:
    'Design a parking lot system. Vehicles arrive at an entrance, are allocated a slot, receive a ticket, and pay on exit based on how long they stayed.',
  requirements: [
    'The lot has multiple floors, each with multiple slots.',
    'Slots come in more than one size and a vehicle must be given a slot it fits.',
    'A vehicle receives a ticket on entry recording where and when it parked.',
    'Charges are calculated on exit; hourly, flat and weekend rates are all in scope.',
    'The system reports how many slots are free.',
  ],
  constraints: [
    'Single lot, single process. No distribution.',
    'Payment processing itself is out of scope; only the amount owed is modelled.',
  ],
  rubricId: 'rubric-lld-mvp',
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
type Mode = 'verify' | 'build' | 'record';

async function main(): Promise<void> {
  const mode: Mode = process.argv.includes('--record')
    ? 'record'
    : process.argv.includes('--build')
      ? 'build'
      : 'verify';

  const submissions = new Map<string, SubmissionFixture>();
  const responses: { file: string; fixture: ResponseFixture }[] = [];

  for (const file of readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8')) as
      | SubmissionFixture
      | ResponseFixture;
    if (parsed.kind === 'submission') {
      submissions.set(parsed.fixtureId, parsed as SubmissionFixture);
    } else {
      responses.push({ file, fixture: parsed as ResponseFixture });
    }
  }

  if (mode === 'record') {
    await recordLive(submissions, responses);
  }

  const problems: string[] = [];
  let written = 0;

  for (const { file, fixture } of responses) {
    const issues = processFixture(fixture, submissions, responses);
    if (issues.length > 0) {
      problems.push(...issues.map((i) => `${file}: ${i}`));
      continue;
    }
    if (mode !== 'verify') {
      writeFileSync(join(FIXTURE_DIR, file), `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
      written += 1;
    }
    console.log(`  ok   ${file}`);
  }

  if (problems.length > 0) {
    console.error('\nFixture problems:');
    for (const p of problems) console.error(`  FAIL ${p}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n${responses.length} response fixtures verified against prompt ${PROMPT_VERSION}` +
      (mode === 'verify' ? ' (no files written; pass --build to write).' : `; ${written} written.`),
  );
}

/**
 * Fills `rawText` and checks the two properties that make a fixture trustworthy:
 * it validates exactly as the shipped code would, and its quotes are real.
 */
function processFixture(
  fixture: ResponseFixture,
  submissions: Map<string, SubmissionFixture>,
  allResponses: { file: string; fixture: ResponseFixture }[],
): string[] {
  const issues: string[] = [];

  if (fixture.promptVersion !== PROMPT_VERSION) {
    issues.push(
      `recorded under prompt ${fixture.promptVersion} but the code ships ${PROMPT_VERSION}. Re-record.`,
    );
  }

  // Resolve the object this fixture's raw text is built from.
  let source: unknown = fixture.parsed;
  if (source === null && typeof fixture.basedOn === 'string') {
    const base = allResponses.find((r) => r.fixture.fixtureId === fixture.basedOn);
    if (!base) {
      issues.push(`basedOn "${fixture.basedOn}" does not match any fixture.`);
      return issues;
    }
    source = base.fixture.parsed;
  }

  if (source === null || source === undefined) {
    issues.push('has neither `parsed` nor a resolvable `basedOn`.');
    return issues;
  }

  fixture.rawText = wrap(JSON.stringify(source, null, 2), fixture.envelope ?? 'plain');

  // A malformed fixture is only useful if it is malformed in the way it claims to be.
  if (fixture.kind === 'malformed-response') {
    const expected = fixture.expected as { salvages?: boolean } | undefined;
    const salvaged = salvageJson(fixture.rawText);
    if (expected && typeof expected.salvages === 'boolean' && salvaged.ok !== expected.salvages) {
      issues.push(
        `claims salvages=${expected.salvages} but salvageJson returned ok=${salvaged.ok}. The fixture no longer exercises the path it documents.`,
      );
    }
    return issues;
  }

  // Well-formed fixtures must pass the exact Ajv schema the evaluator compiles.
  const keys = fixture.criterionKeys ?? RECORDING_CRITERIA.map((c) => c.key);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(buildAjvSchema(keys));
  if (!validate(source)) {
    issues.push(
      `fails Ajv: ${(validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`,
    );
    return issues;
  }

  // The property everything else rests on: every quote is real.
  const submissionId = (fixture.submissionFixture ?? '').replace('.submission.json', '');
  const submission = submissions.get(submissionId);
  if (!submission) {
    issues.push(`submissionFixture "${fixture.submissionFixture}" not found.`);
    return issues;
  }

  const text = TextDesignContent.fromSections(submission.sections).toEvaluationText();
  for (const result of (source as RawEvaluationResponse).results) {
    if (verifyEvidence(result, text) === 'unverified') {
      issues.push(
        `criterion "${result.criterionKey}" has evidence that is NOT a substring of the submission. ` +
          `A fixture with an invented quote makes the evidence tests pass against a lie. Quote: ${JSON.stringify(result.evidence.slice(0, 120))}`,
      );
    }
  }

  return issues;
}

function wrap(json: string, envelope: Envelope): string {
  switch (envelope) {
    case 'plain':
      return json;
    case 'fenced-with-prose':
      return [
        "Certainly! Here's my evaluation of the learner's low-level design against the five rubric criteria.",
        '',
        '```json',
        json,
        '```',
        '',
        'Let me know if you would like me to elaborate on any of the criteria above.',
      ].join('\n');
    case 'truncated':
      // Cut mid-string so no balanced object survives. 55% is comfortably inside the
      // second result's evidence field, which is where a real maxOutputTokens cut lands.
      return json.slice(0, Math.floor(json.length * 0.55));
  }
}

// ---------------------------------------------------------------------------
// --record: the only live-API path in the repository.
// ---------------------------------------------------------------------------
async function recordLive(
  submissions: Map<string, SubmissionFixture>,
  responses: { file: string; fixture: ResponseFixture }[],
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set. --record needs it; --build and --verify do not.');
    process.exit(1);
  }

  const modelId = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const client = new GoogleGenerativeAIClient(apiKey, modelId);
  const deterministic = new DeterministicEvaluator();
  const keys = RECORDING_CRITERIA.map((c) => c.key);

  for (const { fixture } of responses) {
    if (fixture.kind !== 'response' || !fixture.submissionFixture) continue;

    const submissionId = fixture.submissionFixture.replace('.submission.json', '');
    const submission = submissions.get(submissionId);
    if (!submission) continue;

    const content = TextDesignContent.fromSections(submission.sections);
    const report = deterministic.run(content);

    const prompt = buildEvaluationPrompt({
      problem: PARKING_LOT_PROBLEM,
      criteria: RECORDING_CRITERIA,
      deterministicFacts: renderDeterministicFacts(report, content.structuralFacts()),
      submissionText: content.toEvaluationText(),
    });

    console.log(`  ... calling ${modelId} for ${fixture.fixtureId}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let raw: string;
    try {
      raw = await client.generate({
        prompt,
        responseSchema: buildGeminiResponseSchema(keys),
        temperature: GENERATION_CONFIG.temperature,
        topP: GENERATION_CONFIG.topP,
        maxOutputTokens: GENERATION_CONFIG.maxOutputTokens,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const salvaged = salvageJson(raw);
    if (!salvaged.ok) {
      console.error(`  !! ${fixture.fixtureId}: live response did not salvage (${salvaged.reason}).`);
      console.error('     Raw output kept below so the failure itself can become a fixture:');
      console.error(raw);
      continue;
    }

    fixture.parsed = salvaged.value;
    fixture.rawText = raw;
    fixture.model = modelId;
    fixture.recordedBy = 'live';
    fixture.recordedAt = new Date().toISOString();
    fixture.criterionKeys = keys;
  }
}

void main();
