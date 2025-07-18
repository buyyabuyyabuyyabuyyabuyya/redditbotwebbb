import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from 'next/link';

const createSupabaseServerClient = () => {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
};

export default async function Pricing() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const supabase = createSupabaseServerClient();

  // Fetch user's current subscription status
  const { data: user } = await supabase
    .from('users')
    .select('subscription_status')
    .eq('id', userId)
    .single();

  const PLANS = [
    {
      name: 'Free',
      price: '$0',
      description: 'Perfect for getting started',
      features: [
        '1 Reddit account',
        '15 message limit',
        '2 templates',
        '1 scan config',
        'Basic analytics',
      ],
      cta:
        user?.subscription_status === 'free' ? 'Current Plan' : 'Get Started',
    },
    {
      name: 'Pro',
      price: '$7.99',
      description: 'For serious outreach',
      features: [
        '3 Reddit accounts',
        '200 messages/month',
        '3 templates',
        '3 scan configs',
        'Advanced analytics',
        'Priority support',
      ],
      cta:
        user?.subscription_status === 'pro' ? 'Current Plan' : 'Upgrade to Pro',
    },
    {
      name: 'Advanced',
      price: '$13.99',
      description: 'Unlimited capabilities',
      features: [
        'Unlimited accounts',
        'Unlimited messages',
        'Unlimited templates',
        'Unlimited scan configs',
        '24/7 premium support',
      ],
      cta:
        user?.subscription_status === 'advanced'
          ? 'Current Plan'
          : 'Get Advanced',
    },
  ];

  return (
    <div className="bg-gray-900 text-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl sm:text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-6 text-lg leading-8 text-gray-300">
            Choose the plan that's right for you. Start with our free tier and
            upgrade when you're ready.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl rounded-3xl ring-1 ring-white/10 sm:mt-20 lg:mx-0 lg:flex lg:max-w-none">
          {PLANS.map((plan, index) => (
            <div
              key={plan.name}
              className={`relative flex flex-col bg-gray-800/70 p-8 sm:p-10 rounded-2xl ring-1 ring-white/10 ${index === 1 ? 'lg:flex-auto' : ''}`}
            >
              <h3 className="text-2xl font-bold tracking-tight text-white">
                {plan.name} Plan
              </h3>
              <p className="mt-6 text-base leading-7 text-gray-300">
                {plan.description}
              </p>
              <div className="mt-10 flex items-center gap-x-4">
                <h4 className="flex-none text-sm font-semibold leading-6 text-purple-400">
                  What's included
                </h4>
                <div className="h-px flex-auto bg-gray-100" />
              </div>
              <ul
                role="list"
                className="mt-8 grid grid-cols-1 gap-4 text-sm leading-6 text-gray-300 sm:grid-cols-2 sm:gap-6"
              >
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
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
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-10">
                <div className="py-8 text-center lg:flex lg:flex-col lg:justify-center">
                  <div className="mx-auto max-w-xs px-8">
                    <p className="text-base font-semibold text-gray-300">
                      Monthly subscription
                    </p>
                    <p className="mt-6 flex items-baseline justify-center gap-x-2">
                      <span className="text-5xl font-bold tracking-tight text-white">
                        {plan.price}
                      </span>
                      <span className="text-sm font-semibold leading-6 tracking-wide text-gray-300">
                        /month
                      </span>
                    </p>
                    {plan.cta === 'Current Plan' ? (
                      <button
                        type="button"
                        disabled
                        className="mt-10 block w-full rounded-md bg-gray-400 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm"
                      >
                        {plan.cta}
                      </button>
                    ) : plan.name === 'Pro' ? (
                      <a
                        href="https://buy.stripe.com/test_9B6cN76L34NO5MoeYigYU00"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-10 block w-full rounded-md bg-purple-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-purple-500 focus-visible:outline-purple-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600"
                      >
                        {plan.cta}
                      </a>
                    ) : plan.name === 'Advanced' ? (
                      <a
                        href="https://buy.stripe.com/test_5kQbJ3glD944b6I6rMgYU01"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-10 block w-full rounded-md bg-purple-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-purple-500 focus-visible:outline-purple-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600"
                      >
                        {plan.cta}
                      </a>
                    ) : (
                      <Link
                        href="/api/stripe"
                        className="mt-10 block w-full rounded-md bg-purple-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-purple-500 focus-visible:outline-purple-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600"
                      >
                        {plan.cta}
                      </Link>
                    )}
                    <p className="mt-6 text-xs leading-5 text-gray-300">
                      Invoices and receipts available for easy company
                      reimbursement
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
