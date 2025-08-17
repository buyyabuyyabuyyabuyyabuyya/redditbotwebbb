import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { RippleButton, Button3D } from '../components/ui/Button';
import AuthButtons from '../components/AuthButtons';
import { Analytics } from "@vercel/analytics/next"

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect('/dashboard');
  }

  // We'll use the client component imported from components/AuthButtons.tsx

  return (
    <div className="bg-gray-900 text-white">
      <Analytics />
      {/* Site navigation */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-gray-800 bg-gray-900/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-red-400 hover:from-purple-400 hover:to-red-300 transition-all duration-300">
            RedditOutreach
          </Link>
          <nav className="hidden md:flex gap-8 text-sm font-medium">
            <a href="#features" className="hover:text-purple-300">Features</a>
            <a href="#how-it-works" className="hover:text-purple-300">How It Works</a>
            <a href="#pricing" className="hover:text-purple-300">Pricing</a>
          </nav>
          <div className="flex gap-2">
            <AuthButtons />
          </div>
        </div>
      </header>
      
      <main className="pt-20">
      {/* Hero section */}
      <div className="relative isolate px-6 lg:px-8">
        <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
          <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-purple-800 to-red-600 opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" />
        </div>
        {/* subtle noise overlay */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[url('/noise.png')] opacity-20 mix-blend-soft-light" />
        <div className="mx-auto max-w-4xl text-center py-24 sm:py-32">
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-red-500">
            Automate Your Reddit Outreach
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-300 max-w-2xl mx-auto">
            Reach more people on Reddit with our powerful automation platform.
            Customize your messages, target specific subreddits, and track
            your results.
          </p>
          {/* CTA buttons */}
          <div className="mt-10 flex justify-center" id="auth-buttons-container">
            <AuthButtons />
          </div>
        </div>
        <div className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]">
          <div className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-purple-800 to-red-600 opacity-30 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"></div>
        </div>
      </div>

      {/* Features section */}
      <div id="features" className="bg-gray-800 py-24 sm:py-32 scroll-mt-28">
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
              <div className="flex flex-col bg-gray-700/40 p-6 rounded-xl backdrop-blur-lg border border-gray-600/30 ring-1 ring-white/10 hover:ring-purple-500/40 shadow-lg transform hover:-translate-y-1 transition-all duration-300">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-purple-300">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h18M3 12h18M3 21h18" />
                  </svg>
                  AI-Powered Content Analysis
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-300">
                  <p className="flex-auto">Leverage natural-language processing to match keywords and sentiment for higher targeting accuracy.</p>
                </dd>
              </div>
              <div className="flex flex-col bg-gray-700/40 p-6 rounded-xl backdrop-blur-lg border border-gray-600/30 ring-1 ring-white/10 hover:ring-purple-500/40 shadow-lg transform hover:-translate-y-1 transition-all duration-300">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-purple-300">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                  </svg>
                  Instant Subreddit Scan
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-300">
                  <p className="flex-auto">Trigger ad-hoc scans at any time to message fresh posts without waiting for the next schedule.</p>
                </dd>
              </div>
              <div className="flex flex-col bg-gray-700/40 p-6 rounded-xl backdrop-blur-lg border border-gray-600/30 ring-1 ring-white/10 hover:ring-purple-500/40 shadow-lg transform hover:-translate-y-1 transition-all duration-300">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-purple-300">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2a4 4 0 118 0v2" />
                  </svg>
                  Bot-Specific Log Viewer
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-300">
                  <p className="flex-auto">Debug and monitor each bot with live logs directly from your dashboard.</p>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* How It Works section */}
      <div id="how-it-works" className="bg-gray-900 py-24 sm:py-32 scroll-mt-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-purple-400">How It Works</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              See Reddit Bot in Action
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-300">
              Watch how easy it is to set up and automate your Reddit outreach in just a few simple steps.
            </p>
          </div>

          <div className="mx-auto mt-16 max-w-7xl">
            {/* Step 1: Add Reddit Account */}
            <div className="mb-24 flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-[800px] lg:order-1">
                <div className="relative">
                  <img
                    src="/account.gif"
                    alt="Adding a Reddit account demonstration"
                    className="w-full h-auto max-w-[800px] rounded-xl shadow-2xl ring-1 ring-white/10"
                  />
                </div>
              </div>
              <div className="flex-1 lg:order-2">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600">
                    <span className="text-sm font-semibold text-white">1</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white">Connect Your Reddit Account</h3>
                </div>
                <p className="text-lg text-gray-300 leading-relaxed mb-6">
                  Securely connect your Reddit account with OAuth authentication. Your credentials are encrypted and stored safely. Add multiple accounts to scale your outreach across different personas.
                </p>
                <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4">
                  <h4 className="text-amber-400 font-semibold mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    Account Safety Tips
                  </h4>
                  <ul className="text-sm text-gray-300 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-amber-400 mt-1">•</span>
                      <span><strong>Use established accounts:</strong> couple months old, positive karma, verified email</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-400 mt-1">•</span>
                      <span><strong>Content compliance:</strong> No spam or NSFW, avoid unsolicited ads</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-400 mt-1">•</span>
                      <span><strong>Account quality:</strong> Only use accounts with no recent enforcement actions. New accounts are especially prone to being flagged and banned if automated</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 2: Create Message Template */}
            <div className="mb-24 flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-[800px] lg:order-2">
                <div className="relative">
                  <img
                    src="/template.gif"
                    alt="Creating a message template demonstration"
                    className="w-full h-auto max-w-[800px] rounded-xl shadow-2xl ring-1 ring-white/10"
                  />
                </div>
              </div>
              <div className="flex-1 lg:order-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600">
                    <span className="text-sm font-semibold text-white">2</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white">Create Custom Templates</h3>
                </div>
                <p className="text-lg text-gray-300 leading-relaxed">
                  Design personalized message templates with dynamic variables like {'{username}'} and {'{subreddit}'}. Use our pre-built templates or create your own from scratch for different outreach scenarios.
                </p>
              </div>
            </div>

            {/* Step 3: Configure Scan Settings */}
            <div className="mb-24 flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-[800px] lg:order-1">
                <div className="relative">
                  <img
                    src="/scan.gif"
                    alt="Setting up scan configuration demonstration"
                    className="w-full h-auto max-w-[800px] rounded-xl shadow-2xl ring-1 ring-white/10"
                  />
                </div>
              </div>
              <div className="flex-1 lg:order-2">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600">
                    <span className="text-sm font-semibold text-white">3</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white">Set Up Scan Configurations</h3>
                </div>
                <p className="text-lg text-gray-300 leading-relaxed">
                  Target specific subreddits with custom keywords and filters. Set scan intervals, choose which Reddit account to use, and select the perfect message template for each configuration.
                </p>
              </div>
            </div>

            {/* Step 4: Monitor Bot Logs */}
            <div className="mb-12 flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-[800px] lg:order-2">
                <div className="relative">
                  <img
                    src="/logs.gif"
                    alt="Viewing bot logs demonstration"
                    className="w-full h-auto max-w-[800px] rounded-xl shadow-2xl ring-1 ring-white/10"
                  />
                </div>
              </div>
              <div className="flex-1 lg:order-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600">
                    <span className="text-sm font-semibold text-white">4</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white">Monitor & Track Results</h3>
                </div>
                <p className="text-lg text-gray-300 leading-relaxed">
                  Watch your bots in action with real-time logs. Track message delivery, monitor engagement rates, and debug any issues with detailed logging and analytics dashboard.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing section */}
      <div id="pricing" className="bg-gray-900 py-24 sm:py-32 relative overflow-hidden scroll-mt-28">
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
          <div className="mx-auto mt-16 grid gap-8 lg:grid-cols-3 max-w-5xl">
              {/* Free Plan */}
              <div className="flex flex-col bg-gray-800/70 p-8 rounded-2xl border border-purple-500/20 backdrop-blur-sm shadow-lg">
                <h3 className="text-2xl font-bold tracking-tight text-white">Free Plan</h3>
                <p className="mt-4 text-base leading-7 text-gray-300">Perfect for getting started</p>
                <ul className="mt-8 space-y-3 text-sm leading-6 text-gray-300">
                  {['1 Reddit account','15 message limit (one-time)','1 templates','1 scan config','Basic analytics'].map(item => (
                    <li key={item} className="flex gap-x-3">
                      <svg className="h-6 w-5 flex-none text-purple-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>{item}
                    </li>
                  ))}
                </ul>
                <div className="mt-8 text-5xl font-bold tracking-tight text-white">$0</div>
                <div className="mt-6 w-full"><AuthButtons pricing /></div>
              </div>

              {/* Pro Plan */}
              <div className="flex flex-col bg-gray-800/70 p-8 rounded-2xl border border-purple-500/20 backdrop-blur-sm shadow-lg lg:flex-auto">
                <h3 className="text-2xl font-bold tracking-tight text-white">Pro Plan</h3>
                <p className="mt-4 text-base leading-7 text-gray-300">For serious outreach</p>
                <ul className="mt-8 space-y-3 text-sm leading-6 text-gray-300">
                  {['3 Reddit accounts','200 messages/month','3 templates','3 scan configs','Advanced analytics','Priority support'].map(item => (
                    <li key={item} className="flex gap-x-3">
                      <svg className="h-6 w-5 flex-none text-purple-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>{item}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <div className="flex items-baseline gap-x-2 mb-2">
                    <span className="text-lg font-semibold text-gray-400 line-through">$12.99</span>
                    <span className="text-sm text-red-400 font-medium">🔥 Save 38%</span>
                  </div>
                  <div className="text-5xl font-bold tracking-tight text-white">$7.99</div>
                  <p className="mt-2 text-sm text-red-400 font-medium">Limited Time: Discount expires August 30</p>
                </div>
                <div className="mt-6 w-full"><AuthButtons pricing /></div>
              </div>

              {/* Advanced Plan */}
              <div className="flex flex-col bg-gray-800/70 p-8 rounded-2xl border border-purple-500/20 backdrop-blur-sm shadow-lg">
                <h3 className="text-2xl font-bold tracking-tight text-white">Advanced Plan</h3>
                <p className="mt-4 text-base leading-7 text-gray-300">Unlimited capabilities</p>
                <ul className="mt-8 space-y-3 text-sm leading-6 text-gray-300">
                  {['Unlimited accounts','Unlimited messages','Unlimited templates','Unlimited scan configs','AI message optimization','24/7 premium support'].map(item => (
                    <li key={item} className="flex gap-x-3">
                      <svg className="h-6 w-5 flex-none text-purple-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>{item}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <div className="flex items-baseline gap-x-2 mb-2">
                    <span className="text-lg font-semibold text-gray-400 line-through">$18.99</span>
                    <span className="text-sm text-red-400 font-medium">🔥 Save 26%</span>
                  </div>
                  <div className="text-5xl font-bold tracking-tight text-white">$13.99</div>
                  <p className="mt-2 text-sm text-red-400 font-medium">Limited Time: Discount expires August 30</p>
                </div>
                <div className="mt-6 w-full"><AuthButtons pricing /></div>
              </div>
            </div>

            <div className="hidden">
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
                    <span className="text-lg font-semibold text-gray-400 line-through mr-2">
                      $12.99
                    </span>
                    <span className="text-5xl font-bold tracking-tight text-white">
                      $7.99
                    </span>
                    <span className="text-sm font-semibold leading-6 tracking-wide text-gray-400">
                      /month
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-red-400 font-medium">
                    🔥 Limited Time: Discount expires August 30
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
