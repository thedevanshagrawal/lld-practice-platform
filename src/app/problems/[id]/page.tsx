import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContainer } from '@/composition';
import { ProblemNotFoundError } from '@/application';
import { StartAttemptButton } from './StartAttemptButton';

export const dynamic = 'force-dynamic';

/** Screen 2 — requirements, constraints, what it will be judged on, and Start attempt. */
export default async function ProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { getProblem } = await getContainer();

  let problem;
  let rubric;
  try {
    ({ problem, rubric } = await getProblem.execute({ problemRef: id }));
  } catch (error) {
    if (error instanceof ProblemNotFoundError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm">
          ← All problems
        </Link>
        <h1 className="text-xl font-semibold mt-2">{problem.title}</h1>
        <p className="text-sm text-zinc-700 mt-2 max-w-prose">{problem.statement}</p>
      </div>

      <section>
        <h2 className="font-medium">Requirements</h2>
        <ol className="list-decimal ml-5 text-sm space-y-1 mt-2">
          {problem.requirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="font-medium">Constraints</h2>
        <ul className="list-disc ml-5 text-sm space-y-1 mt-2">
          {problem.constraints.map((constraint) => (
            <li key={constraint}>{constraint}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-medium">You will be scored on</h2>
        <ul className="list-disc ml-5 text-sm space-y-1 mt-2">
          {rubric.criteria.map((criterion) => (
            <li key={criterion.key}>
              <span className="font-medium">{criterion.label}</span>{' '}
              <span className="text-zinc-500">({Math.round(criterion.weight * 100)}%)</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-zinc-500 mt-2">
          {rubric.name} v{rubric.version}. There is no single overall grade out of 100 —
          each dimension is scored 0–4 on its own, with evidence.
        </p>
      </section>

      <div className="flex items-center gap-4">
        <StartAttemptButton problemId={problem.id} />
        <Link href={`/history?problemId=${problem.id}`} className="text-sm">
          Previous attempts
        </Link>
      </div>
    </div>
  );
}
