import type { CriterionKey } from '@/domain/ids';

/**
 * Two schemas on purpose (RUBRIC_AND_EVALUATION.md §5).
 *
 *   - `buildGeminiResponseSchema` constrains DECODING, which makes malformed JSON rare.
 *   - `buildAjvSchema` validates the RESULT, which makes malformed JSON impossible to
 *     reach the database.
 *
 * Both are built from the rubric's criterion keys rather than a hard-coded list of five.
 * The rubric is data; a schema with the keys baked in would silently reject a rubric the
 * rest of the system considers valid, and that failure would surface as "the LLM is
 * broken" rather than "the schema is stale".
 *
 * NEITHER SCHEMA HAS AN `overallScore` FIELD, and the Ajv one sets
 * `additionalProperties: false`. The 100-point anti-pattern is not discouraged here, it
 * is structurally unrepresentable — which is stronger than asking the model not to.
 */

/** Gemini's constrained-decoding subset: no $defs, $ref, additionalProperties, if/then, minLength. */
export function buildGeminiResponseSchema(criterionKeys: readonly CriterionKey[]): unknown {
  return {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        minItems: criterionKeys.length,
        maxItems: criterionKeys.length,
        items: {
          type: 'object',
          properties: {
            criterionKey: { type: 'string', enum: [...criterionKeys] },
            score: { type: 'integer', nullable: true },
            evidence: { type: 'string' },
            concern: { type: 'string' },
            suggestion: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['criterionKey', 'score', 'evidence', 'concern', 'suggestion', 'confidence'],
          propertyOrdering: [
            'criterionKey',
            'score',
            'evidence',
            'concern',
            'suggestion',
            'confidence',
          ],
        },
      },
    },
    required: ['results'],
  };
}

/** The canonical JSON Schema (draft 2020-12), enforced server-side by Ajv. */
export function buildAjvSchema(criterionKeys: readonly CriterionKey[]): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://lld-practice.local/schemas/evaluation-response.json',
    title: 'LLM Evaluation Response',
    type: 'object',
    required: ['results'],
    additionalProperties: false,
    properties: {
      results: {
        type: 'array',
        minItems: criterionKeys.length,
        maxItems: criterionKeys.length,
        items: { $ref: '#/$defs/CriterionResult' },
      },
    },
    $defs: {
      CriterionResult: {
        type: 'object',
        required: ['criterionKey', 'score', 'evidence', 'concern', 'suggestion', 'confidence'],
        additionalProperties: false,
        properties: {
          criterionKey: { type: 'string', enum: [...criterionKeys] },
          score: {
            type: ['integer', 'null'],
            minimum: 1,
            maximum: 4,
            description: '1 Novice, 2 Developing, 3 Proficient, 4 Exemplary. null means not evidenced.',
          },
          evidence: {
            type: 'string',
            minLength: 10,
            maxLength: 1200,
            description: "Verbatim quote(s) from the submission, or a string starting with 'NO EVIDENCE:'.",
          },
          concern: { type: 'string', minLength: 10, maxLength: 600 },
          suggestion: { type: 'string', minLength: 10, maxLength: 600 },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        allOf: [
          {
            if: { properties: { score: { type: 'null' } } },
            then: { properties: { evidence: { pattern: '^NO EVIDENCE:' } } },
          },
          {
            if: { properties: { score: { type: 'integer' } } },
            then: { properties: { evidence: { not: { pattern: '^NO EVIDENCE:' } } } },
          },
        ],
      },
    },
  };
}

/** The shape Ajv guarantees on success. Mirrors the schema; not a domain type. */
export interface RawCriterionResult {
  criterionKey: string;
  score: number | null;
  evidence: string;
  concern: string;
  suggestion: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface RawEvaluationResponse {
  results: RawCriterionResult[];
}

/**
 * The model speaks in three words; the domain stores a number in [0, 1]
 * (`Confidence` in `rubric/Criterion.ts`). This is the whole conversion, in one place.
 *
 * Values are spread rather than clustered so the UI can visually de-emphasise a hedged
 * verdict. They carry no probabilistic meaning and are not calibrated — nothing has
 * measured how often a "high" is right.
 */
export const CONFIDENCE_VALUES: Readonly<Record<'high' | 'medium' | 'low', number>> = {
  high: 0.9,
  medium: 0.6,
  low: 0.3,
};

export function confidenceToNumber(label: 'high' | 'medium' | 'low'): number {
  return CONFIDENCE_VALUES[label];
}
