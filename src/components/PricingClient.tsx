'use client';

import { SignUpButton } from '@clerk/nextjs';
import { useAuth } from '@clerk/nextjs';
import { useState } from 'react';
import { useAuthRedirectUrl } from '../hooks/useAuthRedirectUrl';

interface Plan {
  name: string;
  price: string;
  originalPrice?: string;
  discount?: boolean;
  discountExpiry?: string;
  description: string;
  features: string[];
  cta: string;
  popular?: boolean;
}

interface PricingClientProps {
  plans: Plan[];
  userSubscriptionStatus?: string;
}

export default function PricingClient({
  plans,
  userSubscriptionStatus,
}: PricingClientProps) {
  const { userId } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const redirectUrl = useAuthRedirectUrl();

  const handleSubscribe = async (plan: 'pro' | 'advanced') => {
    if (!userId) return;
    setLoading(plan);
    try {
      const response = await fetch('/api/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-checkout-session', plan }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && data.redirectToPortal) {
          alert(data.error || 'You already have an active subscription.');
          window.location.href = '/settings?tab=billing';
          return;
        }
        throw new Error(data.error || 'Failed to create checkout session');
      }
      if (data.redirectToPortal) {
        alert(
          data.message ||
            'Redirecting to billing portal to manage your subscription.'
        );
        window.location.href = '/settings?tab=billing';
        return;
      }
      if (data.upgraded) {
        alert('Your subscription has been updated successfully!');
        window.location.reload();
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else if (data.sessionId) {
        const stripe = (window as any).Stripe(
          process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
        );
        stripe.redirectToCheckout({ sessionId: data.sessionId });
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {plans.map((plan) => {
        const isCurrentPlan =
          (plan.name === 'Free' && userSubscriptionStatus === 'free') ||
          (plan.name === 'Pro' && userSubscriptionStatus === 'pro') ||
          (plan.name === 'Elite' &&
            (userSubscriptionStatus === 'elite' ||
              userSubscriptionStatus === 'advanced'));
        return (
        <div
          key={plan.name}
          className={`rounded-2xl border p-8 shadow-sm ${plan.popular ? 'border-[#7c6cff] bg-[#7c6cff] text-white' : 'border-white/10 bg-[#111111] text-zinc-50'}`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div
                className={`text-sm font-medium ${plan.popular ? 'text-white/70' : 'text-zinc-400'}`}
              >
                {plan.name}
              </div>
              <div className="mt-3 text-4xl font-semibold tracking-tight">
                {plan.price}
                {plan.price !== '$0' ? (
                  <span
                    className={`ml-1 text-sm font-medium ${plan.popular ? 'text-white/70' : 'text-zinc-400'}`}
                  >
                    /month
                  </span>
                ) : null}
              </div>
            </div>
            {plan.popular ? (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em]">
                Popular
              </span>
            ) : null}
          </div>

          <p
            className={`mt-4 text-sm leading-6 ${plan.popular ? 'text-white/80' : 'text-zinc-400'}`}
          >
            {plan.description}
          </p>

          {plan.discount && plan.originalPrice ? (
            <p
              className={`mt-4 text-sm ${plan.popular ? 'text-white/80' : 'text-zinc-400'}`}
            >
              <span className="line-through">{plan.originalPrice}</span> ·
              discount ends {plan.discountExpiry}
            </p>
          ) : null}

          <ul
            className={`mt-8 space-y-3 text-sm leading-6 ${plan.popular ? 'text-white/90' : 'text-zinc-300'}`}
          >
            {plan.features.map((feature) => (
              <li key={feature} className="flex gap-3">
                <span
                  className={`mt-1 h-1.5 w-1.5 rounded-full ${plan.popular ? 'bg-white' : 'bg-zinc-400'}`}
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            {isCurrentPlan ? (
              <button
                type="button"
                disabled
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-zinc-400"
              >
                {plan.cta}
              </button>
            ) : plan.name === 'Pro' ? (
              <button
                onClick={() => handleSubscribe('pro')}
                disabled={loading === 'pro'}
                className={`w-full rounded-xl px-4 py-3 text-sm font-medium ${plan.popular ? 'bg-white text-zinc-950' : 'bg-white text-zinc-950'} disabled:opacity-50`}
              >
                {loading === 'pro' ? 'Loading...' : plan.cta}
              </button>
            ) : plan.name === 'Elite' ? (
              <button
                onClick={() => handleSubscribe('advanced')}
                disabled={loading === 'advanced'}
                className="w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-zinc-950 disabled:opacity-50"
              >
                {loading === 'advanced' ? 'Loading...' : plan.cta}
              </button>
            ) : (
              <SignUpButton
                mode="modal"
                afterSignUpUrl="/dashboard"
                redirectUrl={redirectUrl}
              >
                <button className="w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-zinc-950">
                  {plan.cta}
                </button>
              </SignUpButton>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}
