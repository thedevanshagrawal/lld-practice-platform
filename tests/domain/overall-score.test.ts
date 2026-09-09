import { describe, it, expect } from 'vitest';

import { createCriterionResult } from '@/domain/evaluation/CriterionResult';
import { computeOverallScore } from '@/domain/rubric/scoring';
import { MVP_RUBRIC } from '@/seed/rubric';

/**
 * "We could not score this" and "the learner scored zero" are different facts.
 * Collapsing them is the bug this file exists to prevent — a 0 on a dashboard is a
 * verdict, and a verdict nobody produced is exactly the ungrounded confidence the
 * platform is built against.
 */

function scored(key: string, score: number | null) {
  return createCriterionResult({
    criterionKey: key,
    score,
    evidence:
      score === null
        ? 'NO EVIDENCE: the submission says nothing about this dimension.'
        : 'The parking lot has cars.',
    concern: 'Stated so the result is constructible; the wording is not under test.',
    suggestion: 'Name the classes that would change under a new requirement.',
    confidence: 0.6,
  });
}

describe('computeOverallScore', () => {
  it('applies criterion weights to the overall score', () => {
    const results = [
      scored('requirements_and_assumptions', 1), // weight 0.20
      scored('responsibilities_and_decomposition', 2), // weight 0.25
      scored('coupling_and_cohesion', 3), // weight 0.20
      scored('abstraction_and_interfaces', 4), // weight 0.20
      scored('extensibility', 2), // weight 0.15
    ];

    // 0.2 + 0.5 + 0.6 + 0.8 + 0.3 = 2.4 over an assessed weight of 1.0
    const overall = computeOverallScore(MVP_RUBRIC, results);

    expect(overall.assessedWeight).toBeCloseTo(1, 10);
    expect(overall.weighted).toBe(2.4);
  });

  it('renormalises over the criteria that were actually assessed', () => {
    const results = [
      scored('requirements_and_assumptions', 2), // 0.20
      scored('responsibilities_and_decomposition', 2), // 0.25
      scored('coupling_and_cohesion', 2), // 0.20
      scored('abstraction_and_interfaces', null),
      scored('extensibility', null),
    ];

    const overall = computeOverallScore(MVP_RUBRIC, results);

    // Three of five scored: the mean is 2, NOT 2 dragged down by two unscored rows.
    expect(overall.assessedWeight).toBeCloseTo(0.65, 10);
    expect(overall.weighted).toBe(2);
  });

  it('reports null, never 0, when nothing was assessed', () => {
    const results = MVP_RUBRIC.criteria.map((c) => scored(c.key, null));

    const overall = computeOverallScore(MVP_RUBRIC, results);

    expect(overall.assessedWeight).toBe(0);
    expect(overall.weighted).toBeNull();
    expect(overall.weighted).not.toBe(0);
  });

  it('reports null on an empty result set', () => {
    expect(computeOverallScore(MVP_RUBRIC, []).weighted).toBeNull();
  });

  /**
   * Below three scored criteria an aggregate is false precision, not a score:
   * `EvaluationPipeline.MIN_SCORED_CRITERIA_FOR_A_VERDICT` already refuses to call
   * such a run COMPLETE, and the overall number must agree with it. A run the system
   * declines to call evaluable must not simultaneously publish a headline score.
   */
  it('reports null when fewer than three criteria were scored', () => {
    const results = [
      scored('requirements_and_assumptions', 4),
      scored('responsibilities_and_decomposition', 4),
      scored('coupling_and_cohesion', null),
      scored('abstraction_and_interfaces', null),
      scored('extensibility', null),
    ];

    const overall = computeOverallScore(MVP_RUBRIC, results);

    expect(overall.weighted).toBeNull();
    // The assessed weight is still reported honestly — the caller must be able to see
    // HOW MUCH was assessed even when the aggregate is withheld.
    expect(overall.assessedWeight).toBeCloseTo(0.45, 10);
  });

  it('reports null when exactly one criterion was scored', () => {
    const results = [
      scored('requirements_and_assumptions', 3),
      scored('responsibilities_and_decomposition', null),
      scored('coupling_and_cohesion', null),
      scored('abstraction_and_interfaces', null),
      scored('extensibility', null),
    ];

    expect(computeOverallScore(MVP_RUBRIC, results).weighted).toBeNull();
  });
});

describe('CriterionResult evidence rule', () => {
  it('rejects construction when evidence is empty', () => {
    expect(() =>
      createCriterionResult({
        criterionKey: 'coupling_and_cohesion',
        score: 4,
        evidence: '',
        concern: '',
        suggestion: 'Name a direction for each relationship.',
        confidence: 0.9,
      }),
    ).toThrow(/evidence/i);
  });

  it('rejects construction when evidence is only whitespace', () => {
    expect(() =>
      createCriterionResult({
        criterionKey: 'coupling_and_cohesion',
        score: 4,
        evidence: '   \n\t  ',
        concern: '',
        suggestion: 'Name a direction for each relationship.',
        confidence: 0.9,
      }),
    ).toThrow(/evidence/i);
  });

  it('rejects a non-maximum score with no concern', () => {
    expect(() =>
      createCriterionResult({
        criterionKey: 'coupling_and_cohesion',
        score: 2,
        evidence: 'all classes interact with ParkingLot',
        concern: '',
        suggestion: 'Name a direction for each relationship.',
        confidence: 0.9,
      }),
    ).toThrow(/concern/i);
  });
});
