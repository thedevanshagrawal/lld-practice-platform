import type { Metadata } from 'next';
import Link from 'next/link';
import { LearnerBar } from './_components/LearnerBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'LLD Practice Platform',
  description:
    'Practise low-level design and get rubric-anchored, evidence-backed feedback per criterion.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-zinc-300 bg-white">
          <div className="max-w-3xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="font-semibold no-underline">
              LLD Practice
            </Link>
            <LearnerBar />
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
