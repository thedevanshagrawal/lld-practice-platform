// Ajv2020, not the draft-07 default export: the canonical schema in
// RUBRIC_AND_EVALUATION.md §5.1 declares $schema draft/2020-12, and the default Ajv
// instance rejects it with "no schema with key or ref". Silent-looking import, load-bearing.
import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject, ValidateFunction } from 'ajv';

import type { CriterionKey } from '@/domain/ids';
import type { Criterion } from '@/domain/rubric/Criterion';
import type { CriterionResult } from '@/domain/evaluation/CriterionResult';
import { createCriterionResult } from '@/domain/evaluation/CriterionResult';
import type {
  EvaluationRequest,
  Evaluator,
  EvaluatorOutput,
} from '@/domain/ports/Evaluator';

import type { GeminiClient } from './GeminiClient';
import { GeminiCallError, classifyGeminiError } from './GeminiClient';
import { DeterministicEvaluator, renderDeterministicFacts } from './DeterministicEvaluator';
import type { DeterministicConfig } from './StructuralFinding';
import {
  GENERATION_CONFIG,
  PROMPT_VERSION,
  buildEvaluationPrompt,
  buildRepairPrompt,
} from './prompt';
import type { RawCriterionResult, RawEvaluationResponse } from './responseSchema';
import { buildAjvSchema, buildGeminiResponseSchema, confidenceToNumber } from './responseSchema';
import { looksLikeRefusal, salvageJson } from './salvageJson';
import { verifyEvidence } from './verifyEvidence';

/** What the application layer records as `failureReason` on the attempt. */
export type LlmFailureReason = 'LLM_MALFORMED_OUTPUT' | 'LLM_TIMEOUT' | 'LLM_REFUSED';

export class GeminiEvaluationError extends Error {
  readonly name = 'GeminiEvaluationError';

  constructor(
    readonly failureReason: LlmFailureReason,
    message: string,
    /** Stored on the Evaluation record for debugging. Never shown to the learner. */
    readonly rawResponse: string | null = null,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export interface GeminiEvaluatorOptions {
  /** Per-call abort. 25 s: a healthy Flash call on a ~500-word submission returns in 3–8 s. */
  readonly perCallTimeoutMs?: number;
  /** Total wall clock across the first call, the retry and the repair call. */
  readonly totalBudgetMs?: number;
  /** Fixed pause before the single retry. */
  readonly retryDelayMs?: number;
  readonly deterministicConfig?: DeterministicConfig;
  /**
   * The single documented deterministic-over-LLM override (§7.2.5): a god object flagged
   * by D4 caps `responsibilities_and_decomposition` at Proficient. Idempotent — safe if
   * the pipeline were ever to apply it again.
   */
  readonly applyGodObjectCap?: boolean;
  /** Injectable so tests do not sleep. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS = {
  perCallTimeoutMs: 25_000,
  totalBudgetMs: 60_000,
  retryDelayMs: 2_000,
  applyGodObjectCap: true,
} as const;

/**
 * The criterion the D4 cap applies to. Read from the rubric by convention rather than
 * hard-coded elsewhere; if the rubric renames it, the cap simply stops firing rather than
 * throwing — a missing backstop is a worse day than a crash, but not a broken evaluation.
 */
const DECOMPOSITION_KEY_PATTERNS = [/responsibilit/i, /decomposition/i];
const GOD_OBJECT_CAP_SCORE = 3;

/**
 * GeminiEvaluator — the LLM half of the split, behind the same `Evaluator` port as the
 * deterministic half.
 *
 * The class is mostly defence. The API call is four lines; everything else exists because
 * an unverified LLM verdict is worse than no verdict:
 *
 *   - the prompt never asks "is this a good design?" and the schema cannot express a
 *     global score, so the anti-pattern the brief names is unrepresentable, not merely
 *     discouraged;
 *   - every score is re-checked against the submission text before it is allowed to exist
 *     (`verifyEvidence`), and a score whose quote cannot be found is forced to null with
 *     a stated reason — PER CRITERION, never by discarding the whole response;
 *   - `createCriterionResult` is the only construction path, so a malformed result dies
 *     at the domain boundary. This class does not re-implement that validation.
 *
 * `client` is injected so the test suite substitutes a fake and never touches the live
 * API. That is the only reason `GeminiClient` exists as an interface.
 */
export class GeminiEvaluator implements Evaluator {
  readonly tag = 'llm';
  readonly adapter: string;

  private readonly client: GeminiClient;
  private readonly deterministic: DeterministicEvaluator;
  private readonly opts: Required<Omit<GeminiEvaluatorOptions, 'deterministicConfig' | 'sleep'>> & {
    sleep: (ms: number) => Promise<void>;
  };
  private readonly ajv: Ajv2020;
  private readonly validatorCache = new Map<string, ValidateFunction>();

  constructor(client: GeminiClient, options: GeminiEvaluatorOptions = {}) {
    this.client = client;
    this.adapter = `${client.modelId}/${PROMPT_VERSION}`;
    this.deterministic = new DeterministicEvaluator(options.deterministicConfig);
    this.opts = {
      perCallTimeoutMs: options.perCallTimeoutMs ?? DEFAULTS.perCallTimeoutMs,
      totalBudgetMs: options.totalBudgetMs ?? DEFAULTS.totalBudgetMs,
      retryDelayMs: options.retryDelayMs ?? DEFAULTS.retryDelayMs,
      applyGodObjectCap: options.applyGodObjectCap ?? DEFAULTS.applyGodObjectCap,
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    };
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
  }

  async evaluate(request: EvaluationRequest): Promise<EvaluatorOutput> {
    const deadline = Date.now() + this.opts.totalBudgetMs;

    const criteria = this.orderedCriteria(request);
    if (criteria.length === 0) {
      return { tag: this.tag, adapter: this.adapter, results: [] };
    }

    const submissionText = request.content.toEvaluationText();
    const facts = request.content.structuralFacts();
    const report = this.deterministic.run(request.content);

    const prompt = buildEvaluationPrompt({
      problem: request.problem,
      criteria,
      deterministicFacts: renderDeterministicFacts(report, facts),
      submissionText,
    });

    const keys = criteria.map((c) => c.key);
    const responseSchema = buildGeminiResponseSchema(keys);

    // ---- call 1, plus one retry on a transient failure -----------------------
    const raw = await this.callWithRetry(prompt, responseSchema, deadline);

    if (looksLikeRefusal(raw)) {
      throw new GeminiEvaluationError(
        'LLM_REFUSED',
        'Model returned a plain-text refusal instead of an evaluation.',
        raw,
      );
    }

    // ---- salvage + validate, then at most ONE structure-only repair call -----
    let parsed = this.parseAndValidate(raw, keys);

    if (!parsed.ok) {
      if (Date.now() >= deadline) {
        throw new GeminiEvaluationError(
          'LLM_MALFORMED_OUTPUT',
          `Response was invalid and there was no budget left to repair it: ${parsed.errors.join('; ')}`,
          raw,
        );
      }

      const repairPrompt = buildRepairPrompt({
        originalPrompt: prompt,
        rawResponse: raw,
        validationErrors: parsed.errors,
      });

      let repairedRaw: string;
      try {
        repairedRaw = await this.callOnce(repairPrompt, responseSchema, deadline);
      } catch (error) {
        throw new GeminiEvaluationError(
          error instanceof GeminiCallError && error.kind === 'timeout'
            ? 'LLM_TIMEOUT'
            : 'LLM_MALFORMED_OUTPUT',
          `Repair call failed: ${error instanceof Error ? error.message : String(error)}`,
          raw,
          error,
        );
      }

      const repaired = this.parseAndValidate(repairedRaw, keys);
      if (!repaired.ok) {
        // No repair loop beyond one attempt. A model that returns invalid structure twice
        // will not return it differently on the third try; spending another call is just
        // latency the learner pays for.
        throw new GeminiEvaluationError(
          looksLikeRefusal(repairedRaw) ? 'LLM_REFUSED' : 'LLM_MALFORMED_OUTPUT',
          `Response was still invalid after one repair call: ${repaired.errors.join('; ')}`,
          repairedRaw,
        );
      }
      parsed = repaired;
    }

    // ---- the part that matters: evidence enforcement -------------------------
    const results = parsed.value.results.map((rawResult) =>
      this.toCriterionResult(rawResult, submissionText, report.godObjectClassNames),
    );

    return { tag: this.tag, adapter: this.adapter, results };
  }

  // ===========================================================================
  // Criteria selection
  // ===========================================================================

  /**
   * Exactly the criteria this evaluator was asked for, in rubric order. Keys the rubric
   * does not know are dropped rather than sent — asking the model to score a criterion
   * with no band descriptors is asking for an ungrounded opinion.
   */
  private orderedCriteria(request: EvaluationRequest): Criterion[] {
    const requested = new Set(request.criterionKeys);
    return request.rubric.criteria.filter((c) => requested.has(c.key));
  }

  // ===========================================================================
  // Transport: timeout, one retry, total budget
  // ===========================================================================

  private async callWithRetry(
    prompt: string,
    responseSchema: unknown,
    deadline: number,
  ): Promise<string> {
    try {
      return await this.callOnce(prompt, responseSchema, deadline);
    } catch (error) {
      const callError = error instanceof GeminiCallError ? error : classifyGeminiError(error);

      // Never retry a 400 — the request is wrong, and it will be wrong again.
      if (!callError.isRetryable) {
        throw new GeminiEvaluationError(
          'LLM_MALFORMED_OUTPUT',
          `Gemini rejected the request: ${callError.message}`,
          null,
          callError,
        );
      }

      const remaining = deadline - Date.now();
      if (remaining <= this.opts.retryDelayMs) {
        throw this.toTimeoutOrTransport(callError);
      }

      await this.opts.sleep(this.opts.retryDelayMs);

      try {
        return await this.callOnce(prompt, responseSchema, deadline);
      } catch (retryError) {
        throw this.toTimeoutOrTransport(
          retryError instanceof GeminiCallError ? retryError : classifyGeminiError(retryError),
        );
      }
    }
  }

  private async callOnce(
    prompt: string,
    responseSchema: unknown,
    deadline: number,
  ): Promise<string> {
    // The per-call timeout never outlives the total budget, so a slow first call cannot
    // spend the retry's time as well.
    const budgetLeft = deadline - Date.now();
    if (budgetLeft <= 0) {
      throw new GeminiCallError('timeout', 'Total evaluation budget exhausted before the call.');
    }
    const timeoutMs = Math.min(this.opts.perCallTimeoutMs, budgetLeft);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.client.generate({
        prompt,
        responseSchema,
        temperature: GENERATION_CONFIG.temperature,
        topP: GENERATION_CONFIG.topP,
        maxOutputTokens: GENERATION_CONFIG.maxOutputTokens,
        signal: controller.signal,
      });
    } catch (error) {
      throw classifyGeminiError(error, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  private toTimeoutOrTransport(error: GeminiCallError): GeminiEvaluationError {
    const reason: LlmFailureReason = error.kind === 'timeout' ? 'LLM_TIMEOUT' : 'LLM_MALFORMED_OUTPUT';
    return new GeminiEvaluationError(
      reason,
      `Gemini call failed after one retry: ${error.message}`,
      null,
      error,
    );
  }

  // ===========================================================================
  // Salvage + Ajv
  // ===========================================================================

  private parseAndValidate(
    raw: string,
    keys: readonly CriterionKey[],
  ):
    | { ok: true; value: RawEvaluationResponse }
    | { ok: false; errors: string[] } {
    const salvaged = salvageJson(raw);
    if (!salvaged.ok) {
      return { ok: false, errors: [salvaged.reason] };
    }

    const validate = this.validatorFor(keys);
    if (validate(salvaged.value)) {
      return { ok: true, value: salvaged.value as RawEvaluationResponse };
    }

    return { ok: false, errors: formatAjvErrors(validate.errors) };
  }

  private validatorFor(keys: readonly CriterionKey[]): ValidateFunction {
    const cacheKey = keys.join('|');
    const cached = this.validatorCache.get(cacheKey);
    if (cached) return cached;

    const compiled = this.ajv.compile(buildAjvSchema(keys));
    this.validatorCache.set(cacheKey, compiled);
    return compiled;
  }

  // ===========================================================================
  // Evidence enforcement — §6.4. Per criterion, never per response.
  // ===========================================================================

  private toCriterionResult(
    raw: RawCriterionResult,
    submissionText: string,
    godObjectClassNames: readonly string[],
  ): CriterionResult {
    let score: number | null = raw.score;
    let evidence = raw.evidence;
    let confidence = confidenceToNumber(raw.confidence);
    let concern = raw.concern;
    const suggestion = raw.suggestion;

    const verdict = verifyEvidence(raw, submissionText);

    if (score !== null && verdict === 'unverified') {
      // A score whose quote is not in the submission is a fabrication. It is forced to
      // null, NOT to 0 — "we could not verify this" and "the learner did this badly" are
      // different statements and the learner is entitled to the difference. The rejected
      // quote is kept in the message so the fabrication rate is measurable across releases.
      score = null;
      evidence = `NO EVIDENCE: the evaluator's supporting quote could not be found in the submission, so this criterion was not scored. Rejected quote: ${truncate(raw.evidence, 200)}`;
      confidence = confidenceToNumber('low');
    } else if (score === null && verdict === 'unverified') {
      // Null score without the canonical prefix: keep the null, fix the wording.
      evidence = `NO EVIDENCE: ${raw.evidence}`;
    }

    if (
      score !== null &&
      score > GOD_OBJECT_CAP_SCORE &&
      this.opts.applyGodObjectCap &&
      godObjectClassNames.length > 0 &&
      DECOMPOSITION_KEY_PATTERNS.some((p) => p.test(raw.criterionKey))
    ) {
      // The ONLY place a deterministic check overrides an LLM score (§7.2.5). A measured
      // fact beats a model's optimism. Idempotent, so a pipeline re-applying it is a no-op.
      score = GOD_OBJECT_CAP_SCORE;
      concern = `${concern} Capped at ${GOD_OBJECT_CAP_SCORE}: ${godObjectClassNames.join(
        ', ',
      )} exceeded the god-object thresholds (structural check D4).`;
    }

    if (score === null && concern.trim().length === 0) {
      concern = 'This criterion could not be assessed from the submission as written.';
    }

    // createCriterionResult is the ONLY construction path and it validates. Anything this
    // method got wrong throws InvalidCriterionResultError here, at the domain boundary,
    // rather than three layers later in a React component.
    return createCriterionResult({
      criterionKey: raw.criterionKey,
      score,
      evidence,
      concern,
      suggestion,
      confidence,
    });
  }

}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) return ['Response did not match the required schema.'];
  return errors.map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
