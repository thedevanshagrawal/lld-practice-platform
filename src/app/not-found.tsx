import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-zinc-700">
        That problem or attempt does not exist. If you are running against MongoDB and
        the problem list is empty, run <code>npm run seed</code>.
      </p>
      <Link href="/" className="text-sm">
        ← All problems
      </Link>
    </div>
  );
}
