export { DeterministicEvaluator, renderDeterministicFacts } from './DeterministicEvaluator';
export {
  DEFAULT_DETERMINISTIC_CONFIG,
  hasBlocker,
} from './StructuralFinding';
export type {
  DeterministicConfig,
  DeterministicReport,
  FindingSeverity,
  StructuralCheckId,
  StructuralFinding,
} from './StructuralFinding';

export { GeminiEvaluator, GeminiEvaluationError } from './GeminiEvaluator';
export type { GeminiEvaluatorOptions, LlmFailureReason } from './GeminiEvaluator';

export {
  DEFAULT_GEMINI_MODEL,
  GeminiCallError,
  GoogleGenerativeAIClient,
  classifyGeminiError,
} from './GeminiClient';
export type { GeminiClient, GeminiErrorKind, GeminiGenerateRequest } from './GeminiClient';

export {
  GENERATION_CONFIG,
  PROMPT_VERSION,
  buildEvaluationPrompt,
  buildRepairPrompt,
  renderRubricCriteria,
} from './prompt';

export {
  CONFIDENCE_VALUES,
  buildAjvSchema,
  buildGeminiResponseSchema,
  confidenceToNumber,
} from './responseSchema';
export type { RawCriterionResult, RawEvaluationResponse } from './responseSchema';

export { looksLikeRefusal, salvageJson } from './salvageJson';
export type { SalvageResult } from './salvageJson';

export { MIN_QUOTE_LENGTH, normaliseForEvidence, verifyEvidence } from './verifyEvidence';
export type { EvidenceVerdict } from './verifyEvidence';
