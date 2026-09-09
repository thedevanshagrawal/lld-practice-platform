import { describe, it, expect } from 'vitest';

import { SubmissionContentMapper } from '@/infrastructure/mongo/SubmissionContentMapper';
import { TextDesignContent } from '@/domain/content/TextDesignContent';

/**
 * Regression cover for a bug that reached a running app.
 *
 * The mapper originally guarded with `content instanceof TextDesignContent`. Under the
 * Next.js dev server the route handler and the container cached on `globalThis` ended
 * up holding two separate module copies of the class after a hot reload, so a real
 * instance failed the check and every submission was rejected with "refusing to guess
 * at its shape". Class identity is not stable across module realms; the shape is.
 *
 * The unit suite could not catch it because a single Vitest module graph only ever has
 * one copy of the class, so `instanceof` always passed. The first test below fakes the
 * second realm on purpose: same shape, different prototype.
 */
function sampleSections() {
  return {
    assumptions: ['Payment is always successful.'],
    classes: [
      { name: 'ParkingLot', responsibility: 'Owns the floors', methodNames: ['park', 'unpark'] },
      { name: 'Ticket', responsibility: null, methodNames: ['getId'] },
    ],
    relationships: [
      { from: 'ParkingLot', to: 'Floor', kind: 'COMPOSITION' as const, note: null },
    ],
    tradeOffs: ['None.'],
  };
}

describe('SubmissionContentMapper', () => {
  it('maps content that is structurally right but from a different module realm', () => {
    const real = TextDesignContent.fromSections(sampleSections());

    // A different realm's copy: identical shape, unrelated prototype, so
    // `instanceof TextDesignContent` is false while the object is entirely valid.
    const fromOtherRealm = {
      kind: real.kind,
      sections: real.sections,
      toEvaluationText: () => real.toEvaluationText(),
      structuralFacts: () => real.structuralFacts(),
    };
    expect(fromOtherRealm instanceof TextDesignContent).toBe(false);

    const doc = SubmissionContentMapper.toDocument(fromOtherRealm as never);

    expect(doc.kind).toBe('TEXT_DESIGN');
    expect(doc.sections.classes).toHaveLength(2);
    expect(doc.sections.classes[1]?.responsibility).toBeNull();
    expect(doc.sections.assumptions).toEqual(['Payment is always successful.']);
  });

  it('still refuses to guess when the sections are genuinely missing', () => {
    const mislabelled = { kind: 'TEXT_DESIGN' } as never;

    expect(() => SubmissionContentMapper.toDocument(mislabelled)).toThrow(
      /refusing to guess at its shape/,
    );
  });

  it('round-trips a real instance without losing a null responsibility', () => {
    const original = TextDesignContent.fromSections(sampleSections());

    const restored = SubmissionContentMapper.fromDocument(
      SubmissionContentMapper.toDocument(original),
    );

    expect(restored.kind).toBe('TEXT_DESIGN');
    // A null responsibility is the signal D3 flags. If the round trip coerced it to
    // an empty string the deterministic check would silently stop firing.
    const facts = restored.structuralFacts();
    expect(facts.classes).toHaveLength(2);
    expect(facts.classes[1]?.responsibility).toBeNull();
    expect(facts.classes.filter((c) => c.responsibility === null)).toHaveLength(1);
  });
});
