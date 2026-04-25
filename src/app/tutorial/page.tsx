import React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';

const sections = [
  {
    title: '1. Add a Reddit account',
    body: 'Connect one or more Reddit accounts that will be used for posting comments. Use established accounts and keep your behavior helpful and non-spammy.',
    bullets: [
      'Use accounts with healthy history and verified email',
      'Avoid repetitive posting behavior',
      'Review account availability before starting campaigns',
    ],
  },
  {
    title: '2. Create a reply playbook',
    body: 'Reply playbooks tell the AI how to write. Use them to define tone, promotion level, banned phrases, and what counts as a helpful answer.',
    bullets: [
      'Keep replies helpful first, promotional second',
      'Avoid dropping links in every reply',
      'Use playbooks to steer style rather than writing one canned comment',
    ],
  },
  {
    title: '3. Build a website config',
    body: 'Each website config stores your site description, customer segments, target keywords, negative keywords, business context, and target subreddit list.',
    bullets: [
      'Add only subreddits you actually want to target',
      'Use negative keywords to exclude junk traffic',
      'Keep the site description specific so AI scoring stays sharp',
    ],
  },
  {
    title: '4. Start the auto-poster',
    body: 'The auto-poster rotates through the subreddits in your website config, finds relevant discussions, generates a reply using your playbook guidance, and posts one comment per cycle.',
    bullets: [
      'Check assigned account availability before launch',
      'Review posts today / total posts in the dashboard',
      'Stop campaigns from the active auto-poster panel anytime',
    ],
  },
  {
    title: '5. Review posted comments',
    body: 'Use Posted Comments to audit what was published and confirm the AI is staying on-brand and on-topic.',
    bullets: [
      'Review for relevance, tone, and repetition',
      'Watch for communities where replies underperform',
      'Refine your subreddit list and playbooks over time',
    ],
  },
];

export default async function TutorialPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in?redirect_url=%2Ftutorial');
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-gray-800 bg-black p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
            Getting Started
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            How to run a clean comment campaign
          </h1>
          <p className="mt-4 max-w-3xl text-base text-gray-400">
            This is the new version of the old tutorial. It focuses only on the
            flows that matter now: accounts, reply playbooks, website configs,
            subreddits, auto-posting, and posted comments.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Open Dashboard
            </Link>
            <Link
              href="/discussion-poster"
              className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-medium text-white"
            >
              Open Discussion Poster
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-2xl border border-gray-800 bg-black p-6"
            >
              <h2 className="text-xl font-semibold text-white">
                {section.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-gray-400">
                {section.body}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-gray-300">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2">
                    <span className="text-gray-500">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-amber-800/40 bg-amber-950/30 p-6">
          <h2 className="text-lg font-semibold text-amber-300">
            Best-practice reminder
          </h2>
          <p className="mt-3 text-sm leading-6 text-amber-100/80">
            Use this product for helpful public discussion replies, not spam.
            The safest campaigns use narrow subreddit lists, strong negative
            keywords, low posting frequency, and reply playbooks that bias the
            AI toward usefulness instead of hard selling.
          </p>
        </div>
      </div>
    </div>
  );
}
