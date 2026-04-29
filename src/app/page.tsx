import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AuthButtons from '../components/AuthButtons';
import { Analytics } from '@vercel/analytics/next';

const featureCards = [
  {
    title: 'Configure your subreddit list',
    description:
      'Every website config has its own target subreddit list, so campaigns only run where you explicitly want them to run.',
  },
  {
    title: 'Guide AI with playbooks',
    description:
      'Reply playbooks control tone, promotion level, and banned phrasing so generated comments stay useful and on-brand.',
  },
  {
    title: 'Audit every managed comment',
    description:
      'Track what was posted, from which config, and how your outreach system is behaving over time.',
  },
];

const workflow = [
  'Configure website',
  'Create playbook',
  'Add target subreddits',
  'Start auto-poster',
  'Review posted comments',
];

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect('/dashboard');
  }

  return (
    <div className="bg-zinc-950 text-zinc-50">
      <Analytics />
      <main>
        <section className="border-b border-white/10 px-6 py-20 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-zinc-900/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
                Managed Reddit comment outreach
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight text-zinc-50 sm:text-6xl">
                Comment campaigns powered by a managed posting network.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
                RedditOutreach helps you define subreddit targets, guide AI with
                reply playbooks, run auto-posters, and review every posted
                comment while the platform handles account rotation in the
                background.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <AuthButtons />
              </div>
            </div>

            <div className="surface-card overflow-hidden p-4 lg:p-6">
              <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-400">
                      Live workspace preview
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold text-zinc-50">
                      Comment operations
                    </h2>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                    Running
                  </span>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      Website config
                    </p>
                    <p className="mt-3 text-sm font-medium text-zinc-50">
                      yourapp.com
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      SaaS • startups • entrepreneur • indiehackers
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      Reply playbook
                    </p>
                    <p className="mt-3 text-sm font-medium text-zinc-50">
                      Helpful founder tone
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      Soft CTA • no links unless relevant • ask one question
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      Posts today
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-zinc-50">
                      12
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      Next run
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-zinc-50">
                      18m
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="product" className="px-6 py-20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="page-kicker">Product</p>
              <h2 className="mt-4 text-3xl font-semibold text-zinc-50 sm:text-4xl">
                Built for useful comments, not noisy automation.
              </h2>
              <p className="mt-4 text-base leading-7 text-zinc-400">
                Everything in the workflow is designed around cleaner targeting,
                stricter writing control, and a visible audit trail.
              </p>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {featureCards.map((feature) => (
                <div key={feature.title} className="surface-card p-6">
                  <h3 className="text-xl font-medium text-zinc-50">
                    {feature.title}
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-zinc-400">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="workflow"
          className="border-y border-white/10 bg-zinc-900 px-6 py-20"
        >
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="page-kicker">Workflow</p>
              <h2 className="mt-4 text-3xl font-semibold text-zinc-50 sm:text-4xl">
                A tighter path from setup to posted comments.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-5">
              {workflow.map((step, index) => (
                <div key={step} className="surface-subtle p-5">
                  <div className="text-sm text-zinc-500">0{index + 1}</div>
                  <div className="mt-4 text-base font-medium text-zinc-50">
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="px-6 py-20">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 rounded-2xl border border-white/10 bg-zinc-900 p-8 lg:flex-row lg:items-end lg:justify-between lg:p-12">
            <div className="max-w-2xl">
              <p className="page-kicker">Pricing</p>
              <h2 className="mt-4 text-3xl font-semibold text-zinc-50 sm:text-4xl">
                Start free. Upgrade when your comment volume grows.
              </h2>
              <p className="mt-4 text-base leading-7 text-zinc-400">
                The free plan is enough to validate the full workflow. Upgrade
                only when you need more website configs, more auto-posters, and
                more monthly comments.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/pricing" className="ui-button-secondary">
                View pricing
              </Link>
              <AuthButtons />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
