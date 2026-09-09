import type { SubmissionContent, SubmissionContentKind } from './SubmissionContent';
import type {
  DeclaredClass,
  DeclaredRelationship,
  SectionKey,
  StructuralFacts,
} from './StructuralFacts';

export interface TextDesignSections {
  readonly assumptions: readonly string[];
  readonly classes: readonly DeclaredClass[];
  readonly relationships: readonly DeclaredRelationship[];
  readonly tradeOffs: readonly string[];
}

export class TextDesignContent implements SubmissionContent {
  readonly kind: SubmissionContentKind = 'TEXT_DESIGN';
  private readonly _sections: TextDesignSections;

  private constructor(sections: TextDesignSections) {
    this._sections = sections;
  }

  static fromSections(sections: TextDesignSections): TextDesignContent {
    return new TextDesignContent(sections);
  }

  get sections(): TextDesignSections {
    return this._sections;
  }

  /** Byte-identical for identical input, so prompts and fixtures are reproducible. */
  toEvaluationText(): string {
    const lines: string[] = [];

    lines.push('## Assumptions');
    if (this._sections.assumptions.length === 0) {
      lines.push('(none provided)');
    } else {
      for (const a of this._sections.assumptions) {
        lines.push(`- ${a}`);
      }
    }
    lines.push('');

    lines.push('## Classes');
    if (this._sections.classes.length === 0) {
      lines.push('(none provided)');
    } else {
      for (const cls of this._sections.classes) {
        const resp = cls.responsibility ? ` - ${cls.responsibility}` : '';
        lines.push(`- ${cls.name}${resp}`);
        if (cls.methodNames.length > 0) {
          lines.push(`  Methods: ${cls.methodNames.join(', ')}`);
        }
      }
    }
    lines.push('');

    lines.push('## Relationships');
    if (this._sections.relationships.length === 0) {
      lines.push('(none provided)');
    } else {
      for (const rel of this._sections.relationships) {
        const note = rel.note ? ` (${rel.note})` : '';
        lines.push(`- ${rel.from} → ${rel.to} [${rel.kind}]${note}`);
      }
    }
    lines.push('');

    lines.push('## Trade-offs');
    if (this._sections.tradeOffs.length === 0) {
      lines.push('(none provided)');
    } else {
      for (const t of this._sections.tradeOffs) {
        lines.push(`- ${t}`);
      }
    }

    return lines.join('\n');
  }

  structuralFacts(): StructuralFacts {
    const sectionsPresent: SectionKey[] = [];
    if (this._sections.assumptions.length > 0) sectionsPresent.push('ASSUMPTIONS');
    if (this._sections.classes.length > 0) sectionsPresent.push('CLASSES');
    if (this._sections.relationships.length > 0) sectionsPresent.push('RELATIONSHIPS');
    if (this._sections.tradeOffs.length > 0) sectionsPresent.push('TRADE_OFFS');

    const fullText = this.toEvaluationText();
    const wordCount = fullText.split(/\s+/).filter((w) => w.length > 0).length;

    return {
      sectionsPresent,
      classes: this._sections.classes,
      relationships: this._sections.relationships,
      assumptionCount: this._sections.assumptions.length,
      tradeOffCount: this._sections.tradeOffs.length,
      wordCount,
    };
  }
}
