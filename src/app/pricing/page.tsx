import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from 'next/link';
import PricingClient from '../../components/PricingClient';

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
  let user: { subscription_status?: string } | null = null;

  if (userId) {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase
      .from('users')
      .select('subscription_status')
      .eq('id', userId)
      .single();
    user = data;
  }

  const plans = [
    {
      name: 'Free',
      price: '$0',
      description:
        'Validate the managed posting workflow with one focused config.',
      features: [
        'Up to 1 website config',
        'Up to 1 auto-poster',
        '30 comments per month',
        '1 reply playbook',
        'Managed Posting Network access',
        'Basic analytics',
      ],
      cta:
        user?.subscription_status === 'free' ? 'Current Plan' : 'Get started',
    },
    {
      name: 'Pro',
      price: '$7.99',
      originalPrice: '$12.99',
      discount: true,
      discountExpiry: 'November 15th',
      description:
        'For consistent weekly campaigns across multiple website configs.',
      features: [
        'Up to 5 website configs',
        'Up to 5 auto-posters',
        '300 comments per month',
        'Managed Posting Network access',
        'Unlimited reply playbooks',
        'Advanced analytics',
        'Priority support',
      ],
      cta:
        user?.subscription_status === 'pro' ? 'Current Plan' : 'Upgrade to Pro',
      popular: true,
    },
    {
      name: 'Elite',
      price: '$13.99',
      originalPrice: '$18.99',
      discount: true,
      discountExpiry: 'November 15th',
      description:
        'For higher-volume managed comment systems with expanded capacity.',
      features: [
        'Up to 20 website configs',
        'Up to 20 auto-posters',
        '1,500 comments per month',
        'Managed Posting Network access',
        'Unlimited reply playbooks',
        '24/7 premium support',
      ],
      cta:
        user?.subscription_status === 'advanced' ||
        user?.subscription_status === 'elite'
          ? 'Current Plan'
          : 'Get Elite',
    },
  ];

  return (
    <div className="bg-[#080808] py-16 text-zinc-50">
      <div className="section-shell">
        <div className="mx-auto max-w-2xl text-center">
          <p className="page-kicker">Pricing</p>
          <h1 className="page-title mt-3">
            Simple pricing for comment campaigns
          </h1>
          <p className="mt-4 text-base leading-7 text-zinc-400">
            Start small, validate the workflow, and upgrade only when your
            posting volume and number of active configs grow.
          </p>
        </div>

        <div className="mt-12">
          <PricingClient
            plans={plans}
            userSubscriptionStatus={user?.subscription_status}
          />
        </div>

        <div className="mt-10 text-center text-sm text-zinc-400">
          By subscribing, you agree to our{' '}
          <Link href="/terms" className="underline-offset-4 hover:underline">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            privacy policy
          </Link>
          .
        </div>
      </div>
    </div>
  );
}
