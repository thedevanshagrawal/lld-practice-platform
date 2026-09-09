import type {
  DeclaredClass,
  DeclaredRelationship,
  RelationshipKind,
} from '@/domain/content/StructuralFacts';
import { TextDesignContent } from '@/domain/content/TextDesignContent';

import weakFixture from '../fixtures/gemini/parking-lot-weak.submission.json';
import strongFixture from '../fixtures/gemini/parking-lot-strong.submission.json';

/**
 * Fixture JSON is untyped by definition. This is the ONE place it is narrowed, so a
 * fixture whose shape drifts breaks here rather than three assertions later with a
 * message about `undefined`.
 */
interface RawSections {
  assumptions: string[];
  classes: { name: string; responsibility: string | null; methodNames: string[] }[];
  relationships: { from: string; to: string; kind: string; note: string | null }[];
  tradeOffs: string[];
}

export function contentFromSections(raw: RawSections): TextDesignContent {
  const classes: DeclaredClass[] = raw.classes.map((c) => ({
    name: c.name,
    responsibility: c.responsibility ?? null,
    methodNames: [...c.methodNames],
  }));

  const relationships: DeclaredRelationship[] = raw.relationships.map((r) => ({
    from: r.from,
    to: r.to,
    kind: r.kind as RelationshipKind,
    note: r.note ?? null,
  }));

  return TextDesignContent.fromSections({
    assumptions: [...raw.assumptions],
    classes,
    relationships,
    tradeOffs: [...raw.tradeOffs],
  });
}

/** The deliberately weak parking-lot design. Paired with parking-lot-weak.response.json. */
export function weakParkingLotContent(): TextDesignContent {
  return contentFromSections(weakFixture.sections as unknown as RawSections);
}

/** The upper anchor. Paired with parking-lot-strong.response.json. */
export function strongParkingLotContent(): TextDesignContent {
  return contentFromSections(strongFixture.sections as unknown as RawSections);
}
