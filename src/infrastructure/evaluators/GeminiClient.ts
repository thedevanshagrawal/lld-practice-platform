import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * The seam that keeps the live API out of the test suite.
 *
 * `GeminiEvaluator` depends on this interface and never on `@google/generative-ai`, so a
 * test substitutes a fake that replays a recorded fixture. This is the single mechanism
 * behind test T8 ("no test calls the live Gemini API") — it is a type-level guarantee,
 * not a convention someone has to remember.
 *
 * Deliberately one method taking one string and returning one string. Everything the
 * evaluator needs to vary (schema, temperature) is passed per call; everything it does
 * not need (streaming, function calling, multi-turn, safety settings) is absent, because
 * an interface with a method nobody calls is a liability at fake-writing time.
 */
export interface GeminiGenerateRequest {
  readonly prompt: string;
  /** Gemini's constrained-decoding subset. See RUBRIC_AND_EVALUATION.md §5.2. */
  readonly responseSchema: unknown;
  readonly temperature: number;
  readonly topP: number;
  readonly maxOutputTokens: number;
  /** Aborted by the evaluator's 25 s per-call timeout. */
  readonly signal: AbortSignal;
}

export interface GeminiClient {
  /** Identity recorded on the Evaluation for audit, e.g. 'gemini-2.5-flash'. */
  readonly modelId: string;
  /** Returns the model's raw text. Parsing, salvage and validation are the caller's job. */
  generate(request: GeminiGenerateRequest): Promise<string>;
}

/** Categories the retry policy branches on. Retry on transient, never on a 400. */
export type GeminiErrorKind = 'timeout' | 'rate_limit' | 'server' | 'client' | 'network';

export class GeminiCallError extends Error {
  readonly name = 'GeminiCallError';

  constructor(
    readonly kind: GeminiErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }

  /** Retrying a 400 just spends money to receive the same 400. */
  get isRetryable(): boolean {
    return this.kind !== 'client';
  }
}

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * The one place in the repository that imports `@google/generative-ai`.
 *
 * It contains no evaluation logic on purpose: prompt construction, salvage, validation
 * and evidence verification all live in `GeminiEvaluator`, where they are testable
 * without a network stack or an API key.
 */
export class GoogleGenerativeAIClient implements GeminiClient {
  readonly modelId: string;
  private readonly sdk: GoogleGenerativeAI;

  constructor(apiKey: string, modelId: string = DEFAULT_GEMINI_MODEL) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('GEMINI_API_KEY is not set. Refusing to construct a client that cannot call.');
    }
    this.sdk = new GoogleGenerativeAI(apiKey);
    this.modelId = modelId;
  }

  async generate(request: GeminiGenerateRequest): Promise<string> {
    const model = this.sdk.getGenerativeModel({
      model: this.modelId,
      generationConfig: {
        temperature: request.temperature,
        topP: request.topP,
        maxOutputTokens: request.maxOutputTokens,
        responseMimeType: 'application/json',
        // The SDK's type for responseSchema is its own Schema shape; ours is the
        // OpenAPI-flavoured object from §5.2. Structurally identical, nominally not.
        responseSchema: request.responseSchema as never,
      },
    });

    try {
      const result = await model.generateContent(
        { contents: [{ role: 'user', parts: [{ text: request.prompt }] }] },
        { signal: request.signal },
      );
      return result.response.text();
    } catch (error) {
      throw classifyGeminiError(error, request.signal);
    }
  }
}

export function classifyGeminiError(error: unknown, signal?: AbortSignal): GeminiCallError {
  if (error instanceof GeminiCallError) return error;

  if (signal?.aborted) {
    return new GeminiCallError('timeout', 'Gemini call aborted by timeout.', error);
  }

  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError') {
    return new GeminiCallError('timeout', 'Gemini call aborted.', error);
  }

  const message = error instanceof Error ? error.message : String(error);
  const status = extractStatus(error, message);

  if (status === 429) {
    return new GeminiCallError('rate_limit', `Gemini rate limited: ${message}`, error);
  }
  if (status !== null && status >= 500) {
    return new GeminiCallError('server', `Gemini server error ${status}: ${message}`, error);
  }
  if (status !== null && status >= 400) {
    return new GeminiCallError('client', `Gemini rejected the request (${status}): ${message}`, error);
  }
  return new GeminiCallError('network', `Gemini call failed: ${message}`, error);
}

function extractStatus(error: unknown, message: string): number | null {
  if (typeof error === 'object' && error !== null) {
    const candidate = (error as { status?: unknown }).status;
    if (typeof candidate === 'number') return candidate;
  }
  const match = /\b(4\d{2}|5\d{2})\b/.exec(message);
  return match ? Number(match[1]) : null;
}
