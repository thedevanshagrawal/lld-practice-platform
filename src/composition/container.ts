/**
 * THE COMPOSITION ROOT.
 *
 * This is the only module that knows all four layers exist at once. It reads the
 * environment, picks concrete adapters, and hands them to use cases through
 * constructors. Everything above it depends on interfaces.
 *
 * It lives OUTSIDE `src/application` on purpose. The moment a use case reads
 * `process.env` or imports `mongodb`, the application layer stops being testable
 * without a database, and the layering claim the whole submission rests on becomes a
 * claim rather than a fact.
 *
 * Two supported degradations, both explicit and both logged at startup:
 *
 *   1. No MONGODB_URI  -> in-memory repositories, seeded from `src/seed`. The app is
 *      fully usable; data dies with the process. Same ports, so no other file changes.
 *   2. No GEMINI_API_KEY -> a client that refuses to call. The submission is still
 *      persisted, deterministic structural facts still exist, and the attempt ends
 *      FAILED with a re-run button. Losing the LLM must never lose the learner's work.
 */

import {
  GetAttempt,
  GetHistory,
  GetProblem,
  ListProblems,
  RunEvaluation,
  StartAttempt,
  SubmitAttempt,
} from '@/application';
import { EvaluationPipeline } from '@/domain/evaluation/EvaluationPipeline';
import type { AttemptRepository } from '@/domain/ports/AttemptRepository';
import type { EvaluationRepository } from '@/domain/ports/EvaluationRepository';
import type { ProblemRepository } from '@/domain/ports/ProblemRepository';
import type { RubricRepository } from '@/domain/ports/RubricRepository';
import type { Now } from '@/domain/ports/Clock';
import type { IdGenerator } from '@/domain/ports/IdGenerator';

import {
  DeterministicEvaluator,
  GeminiCallError,
  GeminiEvaluator,
  GoogleGenerativeAIClient,
  DEFAULT_GEMINI_MODEL,
  type GeminiClient,
} from '@/infrastructure/evaluators';
import {
  InMemoryAttemptRepository,
  InMemoryEvaluationRepository,
  InMemoryProblemRepository,
  InMemoryRubricRepository,
  UuidIdGenerator,
  systemNow,
} from '@/infrastructure/memory';
import {
  MongoAttemptRepository,
  MongoEvaluationRepository,
  MongoProblemRepository,
  MongoRubricRepository,
  getDb,
} from '@/infrastructure/mongo';
import { SEED_PROBLEMS, SEED_RUBRICS, assertSeedDataIsWellFormed } from '@/seed';

import { readEnv } from './env';

export type PersistenceMode = 'mongo' | 'memory';
export type EvaluatorMode = 'gemini' | 'unconfigured';

export interface Container {
  readonly persistence: PersistenceMode;
  readonly evaluator: EvaluatorMode;

  /** Exposed for the recovery sweep only; routes use the use cases. */
  readonly attempts: AttemptRepository;

  readonly listProblems: ListProblems;
  readonly getProblem: GetProblem;
  readonly startAttempt: StartAttempt;
  readonly submitAttempt: SubmitAttempt;
  readonly runEvaluation: RunEvaluation;
  readonly getAttempt: GetAttempt;
  readonly getHistory: GetHistory;
}

interface Repositories {
  readonly problems: ProblemRepository;
  readonly rubrics: RubricRepository;
  readonly attempts: AttemptRepository;
  readonly evaluations: EvaluationRepository;
}

/**
 * A client that exists so the app boots without a key and fails honestly when asked to
 * work. `kind: 'client'` is deliberate — it is not retryable, so a missing key costs
 * one immediate rejection rather than a retry and a two-second sleep per attempt.
 */
class UnconfiguredGeminiClient implements GeminiClient {
  readonly modelId = 'unconfigured';

  async generate(): Promise<string> {
    throw new GeminiCallError(
      'client',
      'GEMINI_API_KEY is not set, so no LLM evaluation was attempted. ' +
        'The submission is stored; set the key and press "Re-run evaluation".',
    );
  }
}

async function buildRepositories(): Promise<{
  repositories: Repositories;
  persistence: PersistenceMode;
}> {
  const env = readEnv();

  if (env.mongodbUri) {
    const db = await getDb();
    return {
      persistence: 'mongo',
      repositories: {
        problems: new MongoProblemRepository(db),
        rubrics: new MongoRubricRepository(db),
        attempts: new MongoAttemptRepository(db),
        evaluations: new MongoEvaluationRepository(db),
      },
    };
  }

  // Same ports, different adapters. `src/seed` is pure data, so the in-memory mode is
  // seeded by a constructor argument rather than by a migration.
  assertSeedDataIsWellFormed();
  return {
    persistence: 'memory',
    repositories: {
      problems: new InMemoryProblemRepository(SEED_PROBLEMS),
      rubrics: new InMemoryRubricRepository(SEED_RUBRICS),
      attempts: new InMemoryAttemptRepository(),
      evaluations: new InMemoryEvaluationRepository(),
    },
  };
}

function buildPipeline(): { pipeline: EvaluationPipeline; evaluator: EvaluatorMode } {
  const env = readEnv();

  const client: GeminiClient = env.geminiApiKey
    ? new GoogleGenerativeAIClient(env.geminiApiKey, env.geminiModel ?? DEFAULT_GEMINI_MODEL)
    : new UnconfiguredGeminiClient();

  // The MVP rubric assigns every criterion to the `llm` tag, and `GeminiEvaluator` runs
  // the deterministic structural checks internally to ground its prompt. Adding a second
  // evaluator later is a push onto this array plus an `assessedBy` edit in the rubric —
  // the pipeline asserts coverage is disjoint and total, so a mistake fails at startup
  // rather than at scoring time.
  return {
    pipeline: new EvaluationPipeline([new GeminiEvaluator(client)]),
    evaluator: env.geminiApiKey ? 'gemini' : 'unconfigured',
  };
}

async function build(): Promise<Container> {
  const { repositories, persistence } = await buildRepositories();
  const { pipeline, evaluator } = buildPipeline();

  const ids: IdGenerator = new UuidIdGenerator();
  const now: Now = systemNow;

  const runEvaluation = new RunEvaluation({
    attempts: repositories.attempts,
    evaluations: repositories.evaluations,
    problems: repositories.problems,
    rubrics: repositories.rubrics,
    pipeline,
    ids,
    now,
  });

  // NOTE: `scheduleEvaluation` is deliberately NOT wired.
  //
  // `createInlineEvaluationScheduler` fires an un-awaited promise after the response is
  // sent. On a long-running Node server that is fine; on Vercel the function can be
  // frozen the instant the response is flushed, so the work may simply never happen.
  // Rather than ship something that works locally and silently does nothing in
  // production, the handoff is made explicit: submit persists and returns 202, and the
  // CLIENT posts to /api/attempts/[id]/evaluate. `GET /api/cron/recover` is the backstop
  // for a client that closed the tab. See src/app/api/attempts/[id]/submit/route.ts.
  const submitAttempt = new SubmitAttempt({
    attempts: repositories.attempts,
    ids,
    now,
  });

  // eslint-disable-next-line no-console
  console.log(
    `[composition] persistence=${persistence} evaluator=${evaluator}` +
      (persistence === 'memory' ? ' (MONGODB_URI unset: data is per-process and will not survive a restart)' : '') +
      (evaluator === 'unconfigured' ? ' (GEMINI_API_KEY unset: attempts will end FAILED and stay re-runnable)' : ''),
  );

  return {
    persistence,
    evaluator,
    attempts: repositories.attempts,
    listProblems: new ListProblems({ problems: repositories.problems }),
    getProblem: new GetProblem({
      problems: repositories.problems,
      rubrics: repositories.rubrics,
    }),
    startAttempt: new StartAttempt({
      attempts: repositories.attempts,
      problems: repositories.problems,
      ids,
      now,
    }),
    submitAttempt,
    runEvaluation,
    getAttempt: new GetAttempt({
      attempts: repositories.attempts,
      evaluations: repositories.evaluations,
      problems: repositories.problems,
      rubrics: repositories.rubrics,
      // The floor under the reliability claim. Every criterion in the MVP rubric is
      // assessedBy 'llm', so a Gemini outage leaves an Evaluation with zero results —
      // without this the learner would see a failure and nothing else. These are
      // measured facts recomputed on read, never scores, so they cost one pure function
      // call per page view and are available on a FAILED attempt exactly as on a
      // COMPLETED one. `DeterministicEvaluator` satisfies the port structurally;
      // `src/application` still names no adapter.
      structural: new DeterministicEvaluator(),
    }),
    getHistory: new GetHistory({
      attempts: repositories.attempts,
      evaluations: repositories.evaluations,
      problems: repositories.problems,
      rubrics: repositories.rubrics,
    }),
  };
}

/**
 * Cached on `globalThis` for the same reason the Mongo client is: Next.js reloads
 * modules on every edit in dev, and in memory mode a fresh container would mean a fresh
 * (empty) attempt store on every save.
 */
const globalCache = globalThis as unknown as { __lldContainer?: Promise<Container> };

export function getContainer(): Promise<Container> {
  globalCache.__lldContainer ??= build().catch((error: unknown) => {
    // Never cache a failed build; the next request should retry rather than inherit it.
    globalCache.__lldContainer = undefined;
    throw error;
  });
  return globalCache.__lldContainer;
}
