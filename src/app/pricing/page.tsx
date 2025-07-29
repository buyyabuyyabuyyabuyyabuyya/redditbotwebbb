import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { SignUpButton } from '@clerk/nextjs';
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
      originalPrice: '$12.99',
      discount: true,
      discountExpiry: 'August 30',
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
      originalPrice: '$18.99',
      discount: true,
      discountExpiry: 'August 30',
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
        <div className="mt-16 sm:mt-20">
          <PricingClient 
            plans={PLANS} 
            userSubscriptionStatus={user?.subscription_status}
          />
        </div>
        
        {/* Legal Links */}
        <div className="mt-16 text-center">
          <p className="text-sm text-gray-400 mb-4">
            By subscribing, you agree to our terms and privacy policy.
          </p>
          <div className="flex justify-center space-x-6">
            <Link 
              href="/terms" 
              className="text-sm text-gray-400 hover:text-white transition-colors underline"
            >
              Terms of Service
            </Link>
            <Link 
              href="/privacy" 
              className="text-sm text-gray-400 hover:text-white transition-colors underline"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
