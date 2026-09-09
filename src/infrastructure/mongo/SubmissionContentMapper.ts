import type { SubmissionContent } from '../../domain/content/SubmissionContent';
import type { SubmissionContentDoc } from './documents';
import { TextDesignContent } from '../../domain/content/TextDesignContent';
import type { TextDesignSections } from '../../domain/content/TextDesignContent';

/**
 * The single place in the system that branches on `SubmissionContent.kind`.
 *
 * If a reviewer greps for `kind ===` or `case 'TEXT_DESIGN'`, this file should be the
 * only hit outside `src/domain/content/`. That is Change Test A stated as a grep:
 * adding a diagram format widens the union in the domain, this switch stops
 * compiling, and the compiler becomes the checklist.
 *
 * It is also the only file outside `content/` that names a concrete content class.
 */
export const SubmissionContentMapper = {
  toDocument(content: SubmissionContent): SubmissionContentDoc {
    switch (content.kind) {
      case 'TEXT_DESIGN': {
        const sections = readTextDesignSections(content);
        return {
          kind: 'TEXT_DESIGN',
          sections: {
            assumptions: [...sections.assumptions],
            classes: sections.classes.map((declared) => ({
              name: declared.name,
              responsibility: declared.responsibility,
              methodNames: [...declared.methodNames],
            })),
            relationships: sections.relationships.map((relationship) => ({
              from: relationship.from,
              to: relationship.to,
              kind: relationship.kind,
              note: relationship.note,
            })),
            tradeOffs: [...sections.tradeOffs],
          },
        };
      }
      default:
        return assertNever(content.kind);
    }
  },

  fromDocument(doc: SubmissionContentDoc): SubmissionContent {
    switch (doc.kind) {
      case 'TEXT_DESIGN':
        return TextDesignContent.fromSections({
          assumptions: doc.sections?.assumptions ?? [],
          classes: (doc.sections?.classes ?? []).map((declared) => ({
            name: declared.name,
            responsibility: declared.responsibility ?? null,
            methodNames: declared.methodNames ?? [],
          })),
          relationships: (doc.sections?.relationships ?? []).map((relationship) => ({
            from: relationship.from,
            to: relationship.to,
            kind: relationship.kind ?? 'UNSPECIFIED',
            note: relationship.note ?? null,
          })),
          tradeOffs: doc.sections?.tradeOffs ?? [],
        });
      default:
        return assertNever(doc.kind);
    }
  },
};

function assertNever(value: never): never {
  throw new Error(`Unhandled submission content kind: ${JSON.stringify(value)}`);
}

/**
 * Reads the sections off a TEXT_DESIGN content without an `instanceof` check.
 *
 * `instanceof` was the obvious guard and it was wrong. Under the Next.js dev server
 * the route handler and the container cached on `globalThis` can hold two separate
 * module copies of `TextDesignContent` after a hot reload, so a genuine instance
 * fails the check and a valid submission is rejected. Class identity is not stable
 * across module realms; the shape is.
 *
 * The intent of the original guard is kept: this still refuses to guess. It verifies
 * the four sections are present and array-shaped before trusting them, so a mislabelled
 * object fails loudly here rather than being written to the database half-formed.
 */
function readTextDesignSections(content: { readonly kind: string }): TextDesignSections {
  const sections = (content as { sections?: unknown }).sections;

  const looksRight =
    sections !== null &&
    typeof sections === 'object' &&
    Array.isArray((sections as TextDesignSections).assumptions) &&
    Array.isArray((sections as TextDesignSections).classes) &&
    Array.isArray((sections as TextDesignSections).relationships) &&
    Array.isArray((sections as TextDesignSections).tradeOffs);

  if (!looksRight) {
    throw new Error(
      'Content declares kind TEXT_DESIGN but does not expose the four text design ' +
        'sections; refusing to guess at its shape',
    );
  }

  return sections as TextDesignSections;
}
