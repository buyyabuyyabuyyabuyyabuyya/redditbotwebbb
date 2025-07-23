import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '../../../utils/supabase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const PRO_PRICE_ID = 'price_1RWAVQPBL9IyGFhJuNep8Htw';
const ADVANCED_PRICE_ID = 'price_1RWAeqPBL9IyGFhJCnaG18Gi';

// Using the imported createServerSupabaseClient function

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, plan } = await req.json();

    if (action === 'create-checkout-session') {
      // Determine which price ID to use based on requested plan
      const selectedPlan = plan === 'advanced' ? 'advanced' : 'pro';
      const priceId = selectedPlan === 'advanced' ? ADVANCED_PRICE_ID : PRO_PRICE_ID;

      // Fetch user info (email + any saved stripe_customer_id)
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('email, stripe_customer_id')
        .eq('user_id', userId)
        .single();

      if (userErr) {
        console.error('Error fetching user row:', userErr);
      }

      const customerEmail = userRow?.email || undefined;
      let customerId = userRow?.stripe_customer_id || undefined;

      // If we don't have a customer ID stored, try to look it up in Stripe via email
      if (!customerId && customerEmail) {
        try {
          const search = await stripe.customers.search({
            query: `email:\"${customerEmail}\"`,
          });
          if (search.data.length) {
            customerId = search.data[0].id;
            // Persist for later use
            await supabase
              .from('users')
              .update({ stripe_customer_id: customerId })
              .eq('user_id', userId);
          }
        } catch (err) {
          console.error('Stripe customer search failed', err);
        }
      }

      // If a customer exists, check for active subscription to upgrade
      if (customerId) {
        const subs = await stripe.subscriptions.list({
          customer: customerId,
          status: 'active',
          limit: 1,
        });

        if (subs.data.length) {
          const currentSub = subs.data[0];
          const currentItem = currentSub.items.data[0];

          // If the subscription is already on the desired price, no action needed
          if (currentItem.price.id === priceId) {
            return NextResponse.json({ upgraded: false, message: 'Already on desired plan' });
          }

          // Otherwise, update the subscription in-place (prorated)
          await stripe.subscriptions.update(currentSub.id, {
            proration_behavior: 'create_prorations',
            cancel_at_period_end: false,
            items: [
              {
                id: currentItem.id,
                price: priceId,
              },
            ],
          });

          // Reflect new status in Supabase immediately (webhook will also do it)
          await supabase
            .from('users')
            .update({ subscription_status: selectedPlan })
            .eq('user_id', userId);

          return NextResponse.json({ upgraded: true });
        }
      }

      // No active subscription -> create a new checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?canceled=true`,
        client_reference_id: userId,
        metadata: {
          userId: userId,
          plan: selectedPlan
        },
        customer: customerId, // reuse existing customer if we have one
        customer_email: customerEmail,
        ...(customerId && {
          customer_update: {
            name: 'auto',
            address: 'auto',
          },
        }),
        metadata: {
          email: customerEmail,
          plan: selectedPlan,
          userId,
        },
        subscription_data: {
          metadata: {
            email: customerEmail,
            plan: selectedPlan,
            userId,
          },
        },
      });

      return NextResponse.json({ 
        sessionId: session.id,
        url: session.url 
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in Stripe operation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's subscription status
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('subscription_status')
      .eq('user_id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
      return NextResponse.json(
        { error: 'Failed to fetch user data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      subscriptionStatus: userData.subscription_status,
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
