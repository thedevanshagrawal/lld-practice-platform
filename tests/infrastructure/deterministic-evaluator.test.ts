import { describe, it, expect } from 'vitest';

import type { DeclaredClass } from '@/domain/content/StructuralFacts';
import { TextDesignContent } from '@/domain/content/TextDesignContent';
import { DeterministicEvaluator } from '@/infrastructure/evaluators/DeterministicEvaluator';
import {
  DEFAULT_DETERMINISTIC_CONFIG,
  type StructuralFinding,
} from '@/infrastructure/evaluators/StructuralFinding';

import { weakParkingLotContent } from '../support/content';

const { godObjectMethodThreshold, godObjectShareThreshold, minimumClassCount } =
  DEFAULT_DETERMINISTIC_CONFIG;

function findingFor(findings: readonly StructuralFinding[], checkId: string): StructuralFinding {
  const found = findings.find((f) => f.checkId === checkId);
  if (!found) throw new Error(`No finding for ${checkId}`);
  return found;
}

function content(sections: {
  assumptions?: string[];
  classes?: DeclaredClass[];
  relationships?: never[];
  tradeOffs?: string[];
}): TextDesignContent {
  return TextDesignContent.fromSections({
    assumptions: sections.assumptions ?? ['Single site, single operator.'],
    classes: sections.classes ?? [],
    relationships: [{ from: 'A', to: 'B', kind: 'ASSOCIATION', note: null }],
    tradeOffs: sections.tradeOffs ?? ['Chose an hourly fee scheme.'],
  });
}

function methods(n: number, prefix: string): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}()`);
}

describe('DeterministicEvaluator', () => {
  const evaluator = new DeterministicEvaluator();

  // I1 — the cheapest and most reliable signal in the product. It must never depend
  // on the LLM, and it must name what is missing rather than saying "invalid".
  it('flags a missing Assumptions section by name and blocks', () => {
    const report = evaluator.run(
      TextDesignContent.fromSections({
        assumptions: [],
        classes: [
          { name: 'ParkingLot', responsibility: 'holds floors', methodNames: ['park()'] },
          { name: 'Slot', responsibility: 'holds one vehicle', methodNames: ['occupy()'] },
          { name: 'Ticket', responsibility: 'records entry time', methodNames: ['issuedAt()'] },
        ],
        relationships: [{ from: 'ParkingLot', to: 'Slot', kind: 'AGGREGATION', note: null }],
        tradeOffs: ['Hourly fees only.'],
      }),
    );

    const d1 = findingFor(report.findings, 'D1');
    expect(d1.severity).toBe('blocker');
    expect(d1.message).toContain('Assumptions');
    expect(report.blocking).toBe(true);
  });

  it('names every missing section, not just the first', () => {
    const report = evaluator.run(
      TextDesignContent.fromSections({
        assumptions: [],
        classes: [],
        relationships: [],
        tradeOffs: [],
      }),
    );

    const d1 = findingFor(report.findings, 'D1');
    expect(d1.message).toContain('Assumptions');
    expect(d1.message).toContain('Classes');
    expect(d1.message).toContain('Relationships');
    expect(d1.message).toContain('Trade-offs');
  });

  // I2a — with zero classes there is no decomposition to judge. Blocker, with the
  // count stated, not a silent pass.
  it('blocks when no classes are named, stating the count and the minimum', () => {
    const report = evaluator.run(content({ classes: [] }));

    const d2 = findingFor(report.findings, 'D2');
    expect(d2.severity).toBe('blocker');
    expect(d2.message).toContain('0 classes named');
    expect(d2.message).toContain(String(minimumClassCount));
    expect(report.blocking).toBe(true);

    // D3 must not pretend it checked something that does not exist.
    const d3 = findingFor(report.findings, 'D3');
    expect(d3.severity).toBe('info');
  });

  // I2b — a class present with no responsibility line, flagged BY NAME. Naming it is
  // the whole payoff of structured text over free prose.
  it('flags a class with no responsibility line, quoting the class name', () => {
    const report = evaluator.run(
      content({
        classes: [
          { name: 'ParkingLot', responsibility: 'holds floors', methodNames: ['park()'] },
          { name: 'Gate', responsibility: null, methodNames: ['open()'] },
          { name: 'Slot', responsibility: '   ', methodNames: ['occupy()'] },
        ],
      }),
    );

    const d3 = findingFor(report.findings, 'D3');
    expect(d3.severity).toBe('warning');
    expect(d3.message).toContain('Gate');
    expect(d3.message).toContain('Slot');
    expect(d3.message).not.toContain('ParkingLot,');
    expect(d3.location).toContain('Gate');
  });

  // I3 — the boundary pair. A heuristic that fires on everything is noise, and the
  // off-by-one is exactly where it breaks. The threshold is read from config so the
  // test tracks the rule rather than restating a magic number.
  //
  // The absolute rule is `count >= threshold`, so the pair is (threshold, threshold-1).
  // Filler classes keep every share below `godObjectShareThreshold` so the RELATIVE
  // rule cannot be what fires — otherwise this would not be a test of the absolute one.
  describe('god-object heuristic boundary', () => {
    function withMethodCount(n: number): TextDesignContent {
      const filler: DeclaredClass[] = ['Slot', 'Ticket', 'Floor'].map((name) => ({
        name,
        responsibility: `manages ${name}`,
        methodNames: methods(5, name.toLowerCase()),
      }));
      return content({
        classes: [
          { name: 'ParkingLot', responsibility: 'coordinates parking', methodNames: methods(n, 'op') },
          ...filler,
        ],
      });
    }

    it(`triggers the god-object concern at the ${godObjectMethodThreshold}-method threshold`, () => {
      const report = evaluator.run(withMethodCount(godObjectMethodThreshold));

      const d4 = findingFor(report.findings, 'D4');
      expect(d4.severity).toBe('warning');
      expect(report.godObjectClassNames).toEqual(['ParkingLot']);
      // The evidence must quote the class name AND the measured count, so the learner
      // can check the measurement rather than take a verdict on trust.
      expect(d4.message).toContain('ParkingLot');
      expect(d4.message).toContain(`${godObjectMethodThreshold} methods`);
    });

    it(`does not trigger it one method below the threshold`, () => {
      const report = evaluator.run(withMethodCount(godObjectMethodThreshold - 1));

      const d4 = findingFor(report.findings, 'D4');
      expect(d4.severity).toBe('info');
      expect(report.godObjectClassNames).toEqual([]);
    });

    it('keeps the boundary pair a test of the ABSOLUTE rule, not the relative one', () => {
      // Guards the fixture itself: if filler shrinks, the share rule starts firing and
      // both tests above would still pass while testing something else entirely.
      for (const n of [godObjectMethodThreshold, godObjectMethodThreshold - 1]) {
        const facts = withMethodCount(n).structuralFacts();
        const total = facts.classes.reduce((sum, c) => sum + c.methodNames.length, 0);
        expect(n / total).toBeLessThanOrEqual(godObjectShareThreshold);
      }
    });

    it('does not apply the relative rule to a single-class design, where it means nothing', () => {
      const report = evaluator.run(
        content({
          classes: [
            { name: 'SystemManager', responsibility: 'does everything', methodNames: methods(3, 'do') },
          ],
        }),
      );

      // 3 of 3 methods is a share of 1.0, but with one class that is arithmetic, not
      // a finding. The absolute rule is the only one allowed to speak here.
      expect(report.godObjectClassNames).toEqual([]);
    });
  });

  it('catches the weak parking-lot fixture on every structural axis it was built to fail', () => {
    const report = new DeterministicEvaluator().run(weakParkingLotContent());

    // All four sections are present, so D1 passes — the weakness is judgement, not shape.
    expect(findingFor(report.findings, 'D1').severity).toBe('info');
    expect(findingFor(report.findings, 'D2').severity).toBe('info');
    // Nine methods on ParkingLot: over the absolute threshold and over the share.
    expect(report.godObjectClassNames).toEqual(['ParkingLot']);
    expect(findingFor(report.findings, 'D4').message).toContain('9 methods');
  });

  it('never throws, even on content whose facts cannot be read', () => {
    const broken = {
      kind: 'TEXT_DESIGN' as const,
      toEvaluationText: () => '',
      structuralFacts: () => {
        throw new Error('unreadable');
      },
    };

    const report = evaluator.run(broken);

    expect(report.blocking).toBe(false);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.severity).toBe('info');
  });
});
