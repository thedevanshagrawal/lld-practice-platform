import Link from 'next/link';
import { getContainer } from '@/composition';

export const dynamic = 'force-dynamic';

/**
 * Screen 1 — the four seeded problems.
 *
 * A server component calling the use case directly. There is no reason to make the
 * server fetch its own HTTP route: the JSON API exists for the browser, and the seam
 * that matters (route handler depends on a use case, never on a repository) is intact
 * either way.
 */
export default async function HomePage() {
  const { listProblems, persistence, evaluator } = await getContainer();
  const problems = await listProblems.execute();

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Practise low-level design</h1>
        <p className="text-sm text-zinc-700 max-w-prose">
          Pick a problem, write your design as structured text, and get feedback one
          rubric criterion at a time. Every score has to point at a quote from your own
          words; when the evaluator cannot find one it says so instead of guessing.
        </p>
      </section>

      {problems.length === 0 ? (
        <p className="text-sm border border-amber-400 bg-amber-50 p-3 rounded">
          No problems found. If you are running against MongoDB, run{' '}
          <code>npm run seed</code> first.
        </p>
      ) : (
        <ul className="space-y-2">
          {problems.map((problem) => (
            <li key={problem.id} className="border border-zinc-300 bg-white rounded p-3">
              <Link href={`/problems/${problem.slug}`} className="font-medium">
                {problem.title}
              </Link>
              <p className="text-sm text-zinc-600 mt-1">{problem.statement}</p>
              <p className="text-xs text-zinc-500 mt-2">
                {problem.requirements.length} requirements ·{' '}
                <Link href={`/history?problemId=${problem.id}`}>history</Link>
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-zinc-500">
        Storage: {persistence === 'mongo' ? 'MongoDB' : 'in-memory (data resets on restart)'} ·
        AI evaluator: {evaluator === 'gemini' ? 'Gemini' : 'not configured (attempts will end FAILED and stay re-runnable)'}
      </p>
    </div>
  );
}
