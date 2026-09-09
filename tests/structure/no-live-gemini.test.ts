import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC_ROOT = join(dirname(TESTS_ROOT), 'src');

function filesUnder(root: string, extensions: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) {
      out.push(...filesUnder(full, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The rule, stated once and enforced mechanically: the test suite never calls the live
 * Gemini API. Not once, not behind a flag, not "only in the integration run".
 *
 * A comment saying so is a convention someone forgets under deadline. This is the check
 * that fails the build instead. It is deliberately structural — grepping imports, not
 * intercepting the network — because the point is that the SDK cannot be reached from a
 * test at all, and a mock of `fetch` would only prove that today's code path was mocked.
 */
describe('the test suite is offline by construction', () => {
  const testFiles = filesUnder(TESTS_ROOT, ['.ts']);

  it('has test files to check (guards against a vacuous pass)', () => {
    expect(testFiles.length).toBeGreaterThan(5);
  });

  it('never imports the Gemini SDK from anywhere under tests/', () => {
    const offenders = testFiles.filter((file) =>
      /from\s+['"]@google\/generative-ai['"]|require\(\s*['"]@google\/generative-ai['"]/.test(
        readFileSync(file, 'utf8'),
      ),
    );

    expect(offenders.map((f) => relative(TESTS_ROOT, f))).toEqual([]);
  });

  it('never constructs the live client under tests/', () => {
    const offenders = testFiles.filter((file) =>
      /new\s+GoogleGenerativeAIClient/.test(readFileSync(file, 'utf8')),
    );

    expect(offenders.map((f) => relative(TESTS_ROOT, f))).toEqual([]);
  });

  it('never reads the API key env var under tests/ — a test that needs a key is the wrong test', () => {
    // This guard file names the variable in order to search for it, so it excludes
    // itself. Every other file under tests/ must not mention it at all.
    const needle = ['GEMINI', 'API', 'KEY'].join('_');
    const offenders = testFiles
      .filter((file) => file !== fileURLToPath(import.meta.url))
      .filter((file) => readFileSync(file, 'utf8').includes(needle));

    expect(offenders.map((f) => relative(TESTS_ROOT, f))).toEqual([]);
  });

  /**
   * The seam that makes all of the above possible. If a second file ever imports the
   * SDK, the "instantiated exactly once, in the composition root" claim in the design
   * note has quietly stopped being true, and the fake-client strategy has a hole in it.
   */
  it('confines the Gemini SDK import to a single adapter in src/', () => {
    const importers = filesUnder(SRC_ROOT, ['.ts', '.tsx']).filter((file) =>
      /from\s+['"]@google\/generative-ai['"]/.test(readFileSync(file, 'utf8')),
    );

    expect(importers.map((f) => relative(SRC_ROOT, f).replace(/\\/g, '/'))).toEqual([
      'infrastructure/evaluators/GeminiClient.ts',
    ]);
  });

  it('keeps the domain layer free of Mongo, Next and the Gemini SDK', () => {
    const forbidden = /from\s+['"](mongodb|next|next\/[^'"]*|@google\/generative-ai|react)['"]/;
    const offenders = filesUnder(join(SRC_ROOT, 'domain'), ['.ts']).filter((file) =>
      forbidden.test(readFileSync(file, 'utf8')),
    );

    expect(offenders.map((f) => relative(SRC_ROOT, f).replace(/\\/g, '/'))).toEqual([]);
  });
});
