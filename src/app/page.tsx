import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AuthButtons from '../components/AuthButtons';
import { Analytics } from '@vercel/analytics/next';

const featureCards = [
  {
    title: 'User-defined subreddit targeting',
    description:
      'Each website config now owns its own subreddit list so campaigns only run in communities the user intentionally selected.',
  },
  {
    title: 'Reply playbooks for AI generation',
    description:
      'Instead of saving canned comments, playbooks tell the AI how to sound, what to avoid, and how promotional it is allowed to be.',
  },
  {
    title: 'Posted-comment audit trail',
    description:
      'Review every comment that went out, grouped by website config, so you can keep quality and relevance high.',
  },
];

const workflow = [
  'Connect a Reddit account',
  'Create a reply playbook',
  'Add a website config + subreddit list',
  'Start the auto-poster',
  'Review posted comments',
];

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect('/dashboard');
  }

  return (
    <div className="bg-[#0a0a0a] text-white">
      <Analytics />
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-white"
          >
            RedditOutreach
          </Link>
          <nav className="hidden gap-8 text-sm text-gray-400 md:flex">
            <a href="#product" className="hover:text-white">
              Product
            </a>
            <a href="#workflow" className="hover:text-white">
              Workflow
            </a>
            <a href="#pricing" className="hover:text-white">
              Pricing
            </a>
          </nav>
          <AuthButtons />
        </div>
      </header>

      <main>
        <section className="border-b border-white/10 px-6 py-24 lg:py-32">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-gray-400">
                Comment-first Reddit outreach
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
                Run cleaner Reddit comment campaigns without the AI-SaaS fluff.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-400">
                RedditOutreach helps you define subreddit targets, generate
                replies with playbook rules, run auto-posters, and review every
                posted comment from one operational workspace.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <AuthButtons />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-2xl shadow-black/40">
              <div className="rounded-2xl border border-white/10 bg-black p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <p className="text-sm text-gray-500">Active workspace</p>
                    <h2 className="mt-1 text-xl font-medium text-white">
                      Comment operations
                    </h2>
                  </div>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                    Running
                  </span>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                      Website config
                    </p>
                    <p className="mt-3 text-sm text-gray-200">yourapp.com</p>
                    <p className="mt-2 text-sm text-gray-500">
                      SaaS • startups • entrepreneur • indiehackers
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                      Reply playbook
                    </p>
                    <p className="mt-3 text-sm text-gray-200">
                      Helpful founder tone
                    </p>
                    <p className="mt-2 text-sm text-gray-500">
                      Soft CTA • no links unless relevant • ask one question
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                      Posts today
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-white">12</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                      Next run
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-white">
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
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
                Product
              </p>
              <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
                Built for comment quality, not gimmicks.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {featureCards.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-3xl border border-white/10 bg-white/[0.02] p-6"
                >
                  <h3 className="text-xl font-medium text-white">
                    {feature.title}
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-gray-400">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="workflow"
          className="border-y border-white/10 bg-white/[0.02] px-6 py-20"
        >
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
                Workflow
              </p>
              <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
                A simpler path from setup to posted comments.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-5">
              {workflow.map((step, index) => (
                <div
                  key={step}
                  className="rounded-2xl border border-white/10 bg-black p-5"
                >
                  <div className="text-sm text-gray-500">0{index + 1}</div>
                  <div className="mt-4 text-base font-medium text-white">
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="px-6 py-20">
          <div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-white/[0.03] p-8 lg:p-12">
            <div className="max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
                Pricing
              </p>
              <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
                Start free. Upgrade when your comment volume grows.
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-400">
                The pricing page has the full plan details. The free plan is
                enough to test the full workflow with one account, one website
                config, and a limited number of comment actions.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/pricing"
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black"
              >
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
