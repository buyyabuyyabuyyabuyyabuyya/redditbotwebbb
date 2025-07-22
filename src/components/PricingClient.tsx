'use client';

import { SignUpButton } from '@clerk/nextjs';
import { useAuth } from '@clerk/nextjs';
import { useState } from 'react';

interface Plan {
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  popular?: boolean;
}

interface PricingClientProps {
  plans: Plan[];
  userSubscriptionStatus?: string;
}

export default function PricingClient({ plans, userSubscriptionStatus }: PricingClientProps) {
  const { userId } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (plan: 'pro' | 'advanced') => {
    if (!userId) {
      console.error('User not authenticated');
      return;
    }

    setLoading(plan);
    try {
      const response = await fetch('/api/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create-checkout-session',
          plan: plan,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-3xl p-8 ring-1 xl:p-10 ${
              plan.popular
                ? 'bg-gray-900 ring-purple-500'
                : 'bg-gray-800/70 ring-gray-600/50'
            } backdrop-blur-sm shadow-lg`}
          >
            {plan.popular && (
              <div className="absolute -top-5 left-0 right-0 mx-auto w-32 rounded-full bg-gradient-to-r from-purple-500 to-red-500 px-3 py-2 text-center text-sm font-medium text-white">
                Most popular
              </div>
            )}
            <div className="flex items-center justify-between gap-x-4">
              <h3
                className={`text-lg font-semibold leading-8 ${
                  plan.popular ? 'text-purple-300' : 'text-white'
                }`}
              >
                {plan.name}
              </h3>
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-300">
              {plan.description}
            </p>
            <p className="mt-6 flex items-baseline gap-x-1">
              <span
                className={`text-4xl font-bold tracking-tight ${
                  plan.popular ? 'text-purple-300' : 'text-white'
                }`}
              >
                {plan.price}
              </span>
              {plan.price !== 'Free' && (
                <span className="text-sm font-semibold leading-6 text-gray-300">
                  /month
                </span>
              )}
            </p>
            <ul role="list" className="mt-8 space-y-3 text-sm leading-6 text-gray-300">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-x-3">
                  <svg
                    className="h-6 w-5 flex-none text-purple-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
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
            
            {plan.name === 'Free' && userSubscriptionStatus === 'free' ? (
              <button
                type="button"
                disabled
                className="mt-10 block w-full rounded-md bg-gray-400 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm"
              >
                {plan.cta}
              </button>
            ) : plan.name === 'Pro' ? (
              <button
                onClick={() => handleSubscribe('pro')}
                disabled={loading === 'pro'}
                className="mt-10 block w-full rounded-md bg-purple-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-purple-500 focus-visible:outline-purple-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 disabled:opacity-50"
              >
                {loading === 'pro' ? 'Loading...' : plan.cta}
              </button>
            ) : plan.name === 'Advanced' ? (
              <button
                onClick={() => handleSubscribe('advanced')}
                disabled={loading === 'advanced'}
                className="mt-10 block w-full rounded-md bg-purple-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-purple-500 focus-visible:outline-purple-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 disabled:opacity-50"
              >
                {loading === 'advanced' ? 'Loading...' : plan.cta}
              </button>
            ) : (
              <SignUpButton mode="modal" afterSignUpUrl="/dashboard">
                <button className="mt-10 block w-full rounded-md bg-purple-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-purple-500 focus-visible:outline-purple-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600">
                  {plan.cta}
                </button>
              </SignUpButton>
            )}
            
            <p className="mt-6 text-xs leading-5 text-gray-300">
              Invoices and receipts available for easy company
              reimbursement
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
