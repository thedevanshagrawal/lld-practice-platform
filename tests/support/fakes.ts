import type { GeminiClient, GeminiGenerateRequest } from '@/infrastructure/evaluators/GeminiClient';
import { GeminiCallError } from '@/infrastructure/evaluators/GeminiClient';
import type { CriterionKey } from '@/domain/ids';
import type { CriterionResult } from '@/domain/evaluation/CriterionResult';
import type { EvaluationRequest, Evaluator, EvaluatorOutput } from '@/domain/ports/Evaluator';

/**
 * The whole reason `GeminiClient` is an interface.
 *
 * A scripted client replays recorded text, one entry per call. The last entry repeats
 * so a repair call sees the same broken output the real model would most likely send
 * again. An `Error` entry is thrown instead of returned, which is how a timeout, a 429
 * or a socket reset is expressed without a network stack.
 *
 * `calls` is the assertion surface: "this fixture cost ZERO extra API calls" is a real
 * claim about the salvage path, and it is only checkable if the fake counts.
 */
export class ScriptedGeminiClient implements GeminiClient {
  readonly modelId: string;
  readonly calls: GeminiGenerateRequest[] = [];

  private index = 0;

  constructor(
    private readonly script: readonly (string | Error)[],
    modelId = 'gemini-2.5-flash-fake',
  ) {
    if (script.length === 0) {
      throw new Error('ScriptedGeminiClient needs at least one scripted response.');
    }
    this.modelId = modelId;
  }

  get callCount(): number {
    return this.calls.length;
  }

  async generate(request: GeminiGenerateRequest): Promise<string> {
    this.calls.push(request);
    const entry = this.script[Math.min(this.index, this.script.length - 1)]!;
    this.index += 1;
    if (entry instanceof Error) {
      throw entry;
    }
    return entry;
  }
}

/** Every call aborts the way the 25 s per-call timeout aborts. */
export function timingOutGeminiClient(): ScriptedGeminiClient {
  return new ScriptedGeminiClient([
    new GeminiCallError('timeout', 'Gemini call aborted by timeout.'),
  ]);
}

/** Every call dies at the transport layer. Retryable, so the retry path is exercised too. */
export function networkErrorGeminiClient(): ScriptedGeminiClient {
  return new ScriptedGeminiClient([
    new GeminiCallError('network', 'Gemini call failed: ECONNRESET'),
  ]);
}

/**
 * An `Evaluator` port implementation that returns a fixed set of results.
 * Used where the test is about the pipeline or the history maths, not about parsing.
 */
export class StubEvaluator implements Evaluator {
  readonly requests: EvaluationRequest[] = [];

  constructor(
    readonly tag: string,
    readonly adapter: string,
    private readonly results: readonly CriterionResult[],
  ) {}

  async evaluate(request: EvaluationRequest): Promise<EvaluatorOutput> {
    this.requests.push(request);
    const wanted = new Set<CriterionKey>(request.criterionKeys);
    return {
      tag: this.tag,
      adapter: this.adapter,
      results: this.results.filter((r) => wanted.has(r.criterionKey)),
    };
  }
}

/** Rejects on every call, with whatever error the test wants recorded as the failure. */
export class ThrowingEvaluator implements Evaluator {
  constructor(
    readonly tag: string,
    readonly adapter: string,
    private readonly error: Error,
  ) {}

  async evaluate(): Promise<EvaluatorOutput> {
    throw this.error;
  }
}

/** Tests never sleep. Injected wherever the production code would back off. */
export const noSleep = async (_ms: number): Promise<void> => {};
