import React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';

const sections = [
  {
    title: '1. Configure your website',
    body: 'Add the website you want to promote and describe the audience, customer problem, keywords, negative filters, and target subreddit list.',
    bullets: [
      'Keep the site description specific',
      'Add only subreddits you actually want to target',
      'Use negative keywords to filter out poor-fit discussions',
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
    title: '3. Review managed network capacity',
    body: 'The platform handles posting accounts, rotation, cooldowns, and availability. Your job is to make sure the campaign setup is narrow and useful.',
    bullets: [
      'Check Posting Network status before launch',
      'Use one focused website config per campaign',
      'Stay within your monthly comment capacity',
    ],
  },
  {
    title: '4. Start the auto-poster',
    body: 'The auto-poster rotates through the subreddits in your website config, finds relevant discussions, generates a reply using your playbook guidance, and posts one comment per cycle.',
    bullets: [
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
  if (!userId) redirect('/sign-in?redirect_url=%2Ftutorial');

  return (
    <div className="py-12">
      <div className="section-shell space-y-8">
        <section className="surface-card p-8">
          <p className="page-kicker">Getting started</p>
          <h1 className="page-title mt-3">
            How to run a clean comment campaign
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-500">
            This page replaces the old tutorial. It focuses only on the flows
            that matter now: website configs, reply playbooks, managed network
            status, subreddits, auto-posting, and posted comments.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard" className="ui-button-secondary">
              Open dashboard
            </Link>
            <Link href="/discussion-poster" className="ui-button-primary">
              Open discussion poster
            </Link>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <section key={section.title} className="surface-card p-6">
              <h2 className="text-xl font-semibold text-zinc-950">
                {section.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                {section.body}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-zinc-600">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2">
                    <span className="text-zinc-400">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="surface-card border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold text-amber-900">
            Best-practice reminder
          </h2>
          <p className="mt-3 text-sm leading-6 text-amber-900/80">
            Use this product for helpful public discussion replies, not spam.
            The safest campaigns use narrow subreddit lists, strong negative
            keywords, low posting frequency, and reply playbooks that bias the
            AI toward usefulness instead of hard selling.
          </p>
        </section>
      </div>
    </div>
  );
}
