import type { StructuralFacts } from '@/domain/content/StructuralFacts';
import type { SubmissionContent } from '@/domain/content/SubmissionContent';
import type {
  DeterministicConfig,
  DeterministicReport,
  StructuralFinding,
} from './StructuralFinding';
import { DEFAULT_DETERMINISTIC_CONFIG, hasBlocker } from './StructuralFinding';

/**
 * DeterministicEvaluator — the free, instant, 100%-consistent half of the split.
 *
 * Implements D1–D4 from RUBRIC_AND_EVALUATION.md §3.
 * D5 (duplicate submission) and D6 (legal state transition) are also deterministic but
 * are NOT implemented here: neither is computable from a submission's content. D5 is a
 * database uniqueness constraint and D6 is `Attempt`'s own state machine. Re-deriving
 * them from `StructuralFacts` would be inventing an answer this class cannot know.
 *
 * Three guarantees the rest of the system relies on:
 *
 *   1. It NEVER throws. Every path is wrapped; an internal error degrades to an `info`
 *      finding, because a crash here would take down feedback the learner is entitled
 *      to regardless of what the LLM does.
 *   2. It is fast — pure arithmetic over `StructuralFacts`, no I/O, no parsing. It reads
 *      `SubmissionContent.structuralFacts()` and never touches `TextDesignContent`, so a
 *      diagram format works here unchanged (Change Test A).
 *   3. It returns findings, NEVER scores. A method count is a measurement. Presenting it
 *      as a design judgement is exactly the ungrounded-confidence failure this platform
 *      exists to avoid.
 */
export class DeterministicEvaluator {
  readonly tag = 'deterministic';
  readonly adapter = 'structural-checks-v1';

  private readonly config: DeterministicConfig;

  constructor(config: DeterministicConfig = DEFAULT_DETERMINISTIC_CONFIG) {
    this.config = config;
  }

  /** Convenience entry point. Reads the seam, never the concrete content class. */
  run(content: SubmissionContent): DeterministicReport {
    let facts: StructuralFacts;
    try {
      facts = content.structuralFacts();
    } catch {
      return {
        findings: [
          {
            checkId: 'D1',
            severity: 'info',
            message:
              'Structural checks could not read this submission and were skipped. AI feedback is unaffected.',
            location: 'document',
          },
        ],
        blocking: false,
        godObjectClassNames: [],
      };
    }
    return this.check(facts);
  }

  /** The checks themselves. Format-neutral: facts in, findings out. */
  check(facts: StructuralFacts): DeterministicReport {
    try {
      const findings: StructuralFinding[] = [];

      findings.push(this.checkRequiredSections(facts));
      findings.push(this.checkClassCount(facts));
      findings.push(this.checkResponsibilityLines(facts));

      const godObjects = this.findGodObjects(facts);
      findings.push(godObjects.finding);

      return {
        findings,
        blocking: hasBlocker(findings),
        godObjectClassNames: godObjects.classNames,
      };
    } catch {
      // Belt and braces. A bug in a counting rule must not cost the learner their feedback.
      return {
        findings: [
          {
            checkId: 'D1',
            severity: 'info',
            message:
              'Structural checks did not complete and were skipped. AI feedback is unaffected.',
            location: 'document',
          },
        ],
        blocking: false,
        godObjectClassNames: [],
      };
    }
  }

  // ---------------------------------------------------------------------------
  // D1 — all required sections present
  // ---------------------------------------------------------------------------
  private checkRequiredSections(facts: StructuralFacts): StructuralFinding {
    const present = new Set(facts.sectionsPresent);
    const missing = this.config.requiredSections.filter((s) => !present.has(s));

    if (missing.length === 0) {
      return {
        checkId: 'D1',
        severity: 'info',
        message: `All ${this.config.requiredSections.length} required sections present.`,
        location: 'document',
      };
    }

    return {
      checkId: 'D1',
      severity: 'blocker',
      message: `Missing required section${missing.length === 1 ? '' : 's'}: ${missing
        .map(humanSectionName)
        .join(', ')}. There is not enough here to evaluate a design.`,
      location: 'document',
    };
  }

  // ---------------------------------------------------------------------------
  // D2 — at least N classes named
  // ---------------------------------------------------------------------------
  private checkClassCount(facts: StructuralFacts): StructuralFinding {
    const count = facts.classes.length;
    const min = this.config.minimumClassCount;

    if (count >= min) {
      return {
        checkId: 'D2',
        severity: 'info',
        message: `${count} classes named (minimum ${min}).`,
        location: 'Classes',
      };
    }

    return {
      checkId: 'D2',
      severity: 'blocker',
      message: `${count} class${count === 1 ? '' : 'es'} named; at least ${min} are needed. Below ${min} there is no decomposition to judge.`,
      location: 'Classes',
    };
  }

  // ---------------------------------------------------------------------------
  // D3 — every class has a non-empty responsibility line
  //
  // PRESENCE ONLY. Whether "Ticket - a ticket" is a *meaningful* responsibility is a
  // judgement call and belongs to the LLM (criterion 1.2). This is the clearest
  // illustration of the deterministic/LLM boundary in the whole system.
  // ---------------------------------------------------------------------------
  private checkResponsibilityLines(facts: StructuralFacts): StructuralFinding {
    const total = facts.classes.length;
    const missing = facts.classes
      .filter((c) => c.responsibility === null || c.responsibility.trim().length === 0)
      .map((c) => c.name);

    if (total === 0) {
      return {
        checkId: 'D3',
        severity: 'info',
        message: 'No classes declared, so there were no responsibility lines to check.',
        location: 'Classes',
      };
    }

    if (missing.length === 0) {
      return {
        checkId: 'D3',
        severity: 'info',
        message: `All ${total} classes have a responsibility line.`,
        location: 'Classes',
      };
    }

    return {
      checkId: 'D3',
      severity: 'warning',
      message: `${missing.length} of ${total} classes have no responsibility line: ${missing.join(', ')}. A class without a stated job cannot be assessed for single responsibility.`,
      location: `Classes > ${missing.join(', ')}`,
    };
  }

  // ---------------------------------------------------------------------------
  // D4 — god-object heuristic
  //
  // Two rules, either of which flags. Thresholds are ARGUED defaults in config, not
  // measured values — see RUBRIC_AND_EVALUATION.md §3.1. Produces a flag, never a score.
  // ---------------------------------------------------------------------------
  private findGodObjects(facts: StructuralFacts): {
    finding: StructuralFinding;
    classNames: readonly string[];
  } {
    const totalMethods = facts.classes.reduce((sum, c) => sum + c.methodNames.length, 0);

    if (facts.classes.length === 0 || totalMethods === 0) {
      return {
        finding: {
          checkId: 'D4',
          severity: 'info',
          message: 'No methods listed, so the god-object check had nothing to measure.',
          location: 'Classes',
        },
        classNames: [],
      };
    }

    const flagged: { name: string; count: number; share: number }[] = [];

    for (const cls of facts.classes) {
      const count = cls.methodNames.length;
      const share = count / totalMethods;
      const overAbsolute = count >= this.config.godObjectMethodThreshold;
      // Relative rule only means something once there is more than one class to be
      // relative to; on a 1-class design the share is trivially 1.0 and says nothing.
      const overRelative = facts.classes.length > 1 && share > this.config.godObjectShareThreshold;

      if (overAbsolute || overRelative) {
        flagged.push({ name: cls.name, count, share });
      }
    }

    if (flagged.length === 0) {
      return {
        finding: {
          checkId: 'D4',
          severity: 'info',
          message: `No class exceeds ${this.config.godObjectMethodThreshold} listed methods or ${Math.round(
            this.config.godObjectShareThreshold * 100,
          )}% of all listed methods.`,
          location: 'Classes',
        },
        classNames: [],
      };
    }

    const parts = flagged.map(
      (f) =>
        `${f.name} lists ${f.count} method${f.count === 1 ? '' : 's'} (threshold ${
          this.config.godObjectMethodThreshold
        }) and holds ${Math.round(f.share * 100)}% of all listed methods (threshold ${Math.round(
          this.config.godObjectShareThreshold * 100,
        )}%)`,
    );

    return {
      finding: {
        checkId: 'D4',
        severity: 'warning',
        message: `${parts.join('; ')}. Possible god object.`,
        location: `Classes > ${flagged.map((f) => f.name).join(', ')}`,
      },
      classNames: flagged.map((f) => f.name),
    };
  }
}

function humanSectionName(section: string): string {
  switch (section) {
    case 'ASSUMPTIONS':
      return 'Assumptions';
    case 'CLASSES':
      return 'Classes';
    case 'RELATIONSHIPS':
      return 'Relationships';
    case 'TRADE_OFFS':
      return 'Trade-offs';
    default:
      return section;
  }
}

/**
 * Renders findings into the `{{DETERMINISTIC_FACTS}}` block of the Gemini prompt.
 *
 * Injected as FACTS, not questions, so the model reconciles with measured reality
 * rather than re-deriving it — and, per the prompt, it still cannot use them alone as
 * evidence. A quote from the learner is always required.
 */
export function renderDeterministicFacts(
  report: DeterministicReport,
  facts: StructuralFacts,
): string {
  const lines: string[] = [];

  for (const finding of report.findings) {
    lines.push(`- ${finding.message}`);
  }

  if (facts.classes.length > 0) {
    lines.push(`- Classes named: ${facts.classes.map((c) => c.name).join(', ')}.`);
  }
  lines.push(
    `- The submission declares ${facts.assumptionCount} assumption${
      facts.assumptionCount === 1 ? '' : 's'
    }, ${facts.relationships.length} relationship${
      facts.relationships.length === 1 ? '' : 's'
    } and ${facts.tradeOffCount} trade-off${facts.tradeOffCount === 1 ? '' : 's'}.`,
  );

  return lines.join('\n');
}
