'use client';

import Link from 'next/link';
import { useUser } from '@clerk/nextjs';

export default function Footer() {
  const { isSignedIn } = useUser();
  const safe = (path: string) => (isSignedIn ? path : '/');

  return (
    <footer className="border-t border-white/10 bg-zinc-950">
      <div className="section-shell py-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <div className="text-sm font-semibold text-zinc-100">
              RedditOutreach
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Comment-first Reddit outreach for teams that want cleaner
              targeting, AI reply playbooks, and a full audit trail of what gets
              posted.
            </p>
          </div>

          <div className="flex flex-wrap gap-6 text-sm text-zinc-400">
            <Link href="/" className="hover:text-zinc-100">
              Home
            </Link>
            <Link href={safe('/pricing')} className="hover:text-zinc-100">
              Pricing
            </Link>
            <Link href={safe('/tutorial')} className="hover:text-zinc-100">
              Getting Started
            </Link>
            <Link href={safe('/dashboard')} className="hover:text-zinc-100">
              Dashboard
            </Link>
            <Link href="/privacy" className="hover:text-zinc-100">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-zinc-100">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
