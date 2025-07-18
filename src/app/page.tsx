import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { RippleButton, Button3D } from '../components/ui/Button';
import AuthButtons from '../components/AuthButtons';

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect('/dashboard');
  }

  // We'll use the client component imported from components/AuthButtons.tsx

  return (
    <div className="bg-gray-900 text-white">
      {/* Site navigation */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-gray-800 bg-gray-900/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-semibold tracking-tight text-white">
            Reddit <span className="text-purple-400">Bot</span>
          </Link>
          <nav className="hidden md:flex gap-8 text-sm font-medium">
            <a href="#features" className="hover:text-purple-300">Features</a>
            <a href="#pricing" className="hover:text-purple-300">Pricing</a>
            <a href="https://github.com/buyyabuyyabuyyabuyyabuyya/redditbotwebbb" target="_blank" rel="noopener" className="hover:text-purple-300">GitHub</a>
          </nav>
          <div className="flex gap-2">
            <AuthButtons />
          </div>
        </div>
      </header>
      <main className="pt-28">
      {/* Hero section */}
      <div className="relative isolate px-6 pt-14 lg:px-8">
        <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
          <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-purple-800 to-red-600 opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" />
        </div>
        {/* subtle noise overlay */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[url('/noise.png')] opacity-20 mix-blend-soft-light" />
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-16 py-32 sm:py-48 lg:flex-row lg:items-center lg:gap-24">
          {/* Text area */}
          <div className="flex-1 text-center lg:text-left">
            <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-red-500">
              Automate Your Reddit Outreach
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-300">
              Reach more people on Reddit with our powerful automation platform.
              Customize your messages, target specific subreddits, and track
              your results.
            </p>
            {/* CTA buttons */}
            <div className="mt-10 flex justify-center lg:justify-start" id="auth-buttons-container">
              <AuthButtons />
            </div>
          </div>
          {/* Image preview */}
          <div className="flex-1 mt-12 lg:mt-0 hidden lg:block">
            <Image
              src="/dashboard-preview.png"
              alt="Reddit Bot dashboard preview"
              width={600}
              height={400}
              className="w-full rounded-xl shadow-2xl ring-1 ring-white/10"
              priority
            />
          </div>
        </div>
        <div className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]">
          <div className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-purple-800 to-red-600 opacity-30 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"></div>
        </div>
      </div>

      {/* Features section */}
      <div className="bg-gray-800 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-purple-400">
              Features
            </h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Everything you need to scale your Reddit outreach
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
              <div className="flex flex-col bg-gray-700/40 p-6 rounded-xl backdrop-blur-lg border border-gray-600/30 ring-1 ring-white/10 hover:ring-purple-500/40 shadow-lg transform hover:-translate-y-1 transition-all duration-300">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-purple-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-6 h-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
                    />
                  </svg>
                  Multiple Bot Accounts
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-300">
                  <p className="flex-auto">
                    Run multiple Reddit accounts simultaneously to maximize your
                    outreach and engage with more communities.
                  </p>
                </dd>
              </div>
              <div className="flex flex-col bg-gray-700/40 p-6 rounded-xl backdrop-blur-lg border border-gray-600/30 ring-1 ring-white/10 hover:ring-purple-500/40 shadow-lg transform hover:-translate-y-1 transition-all duration-300">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-purple-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-6 h-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
                    />
                  </svg>
                  Custom Message Templates
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-300">
                  <p className="flex-auto">
                    Create and save custom message templates for different
                    scenarios, making your outreach efficient and personalized.
                  </p>
                </dd>
              </div>
              <div className="flex flex-col bg-gray-700/40 p-6 rounded-xl backdrop-blur-lg border border-gray-600/30 ring-1 ring-white/10 hover:ring-purple-500/40 shadow-lg transform hover:-translate-y-1 transition-all duration-300">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-purple-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-6 h-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
                    />
                  </svg>
                  Detailed Analytics
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-300">
                  <p className="flex-auto">
                    Track your message success rates and engagement metrics with
                    beautiful visualizations and real-time data.
                  </p>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Pricing section */}
      <div className="bg-gray-900 py-24 sm:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,#4c1d95,transparent_65%)]"></div>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
          <div className="mx-auto max-w-2xl sm:text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-6 text-lg leading-8 text-gray-300">
              Choose the plan that's right for you. Start with our free tier and
              upgrade when you're ready.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl rounded-3xl border border-purple-500/20 ring-1 ring-white/10 shadow-lg shadow-purple-500/10 sm:mt-20 lg:mx-0 lg:flex lg:max-w-none overflow-hidden">
            <div className="p-8 sm:p-10 lg:flex-auto bg-gray-800/70 backdrop-blur-sm">
              <h3 className="text-2xl font-bold tracking-tight text-white">
                Pro Plan
              </h3>
              <p className="mt-6 text-base leading-7 text-gray-300">
                Get unlimited messages and access to all features.
              </p>
              <div className="mt-10 flex items-center gap-x-4">
                <h4 className="flex-none text-sm font-semibold leading-6 text-purple-400">
                  What's included
                </h4>
                <div className="h-px flex-auto bg-gray-700" />
              </div>
              <ul
                role="list"
                className="mt-8 grid grid-cols-1 gap-4 text-sm leading-6 text-gray-300 sm:grid-cols-2 sm:gap-6"
              >
                <li className="flex gap-x-3">
                  <svg
                    className="h-6 w-5 flex-none text-purple-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Unlimited messages
                </li>
                <li className="flex gap-x-3">
                  <svg
                    className="h-6 w-5 flex-none text-purple-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Multiple bot accounts
                </li>
                <li className="flex gap-x-3">
                  <svg
                    className="h-6 w-5 flex-none text-blue-600"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Custom message templates
                </li>
                <li className="flex gap-x-3">
                  <svg
                    className="h-6 w-5 flex-none text-blue-600"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Advanced analytics
                </li>
              </ul>
              <div className="mt-10 flex items-center gap-x-4">
                <h4 className="flex-none text-sm font-semibold leading-6 text-purple-400">
                  Support
                </h4>
                <div className="h-px flex-auto bg-gray-700" />
              </div>
              <ul
                role="list"
                className="mt-8 grid grid-cols-1 gap-4 text-sm leading-6 text-gray-300 sm:grid-cols-2 sm:gap-6"
              >
                <li className="flex gap-x-3">
                  <svg
                    className="h-6 w-5 flex-none text-purple-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                  24/7 support
                </li>
                <li className="flex gap-x-3">
                  <svg
                    className="h-6 w-5 flex-none text-purple-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Priority updates
                </li>
              </ul>
            </div>
            <div className="p-2 lg:flex lg:flex-shrink-0 lg:flex-col lg:justify-center lg:p-8 bg-gray-800/70 backdrop-blur-sm">
              <div className="rounded-2xl bg-gradient-to-br from-gray-700 to-gray-800 py-10 text-center lg:flex lg:flex-col lg:justify-center lg:py-16 border border-purple-500/20 shadow-lg">
                <div className="mx-auto max-w-xs px-8">
                  <p className="text-base font-semibold text-purple-300">
                    Monthly
                  </p>
                  <p className="mt-6 flex items-baseline justify-center gap-x-2">
                    <span className="text-5xl font-bold tracking-tight text-white">
                      $7.99
                    </span>
                    <span className="text-sm font-semibold leading-6 tracking-wide text-gray-400">
                      /month
                    </span>
                  </p>
                  <div className="mt-10 w-full">
                    <AuthButtons pricing={true} />
                  </div>
                  <p className="mt-6 text-xs leading-5 text-gray-400">
                    Cancel anytime. No credit card required.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
        </main>
    </div>
  );
}
