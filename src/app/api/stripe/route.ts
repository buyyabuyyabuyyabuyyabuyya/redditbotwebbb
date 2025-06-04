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
      const priceId =
        selectedPlan === 'advanced' ? ADVANCED_PRICE_ID : PRO_PRICE_ID;

      // Fetch user email/phone/name from DB (if stored)
      const { data: userRow } = await supabase
        .from('users')
        .select('email')
        .eq('user_id', userId)
        .single();
      const customerEmail = userRow?.email || undefined;

      // Create Stripe checkout session using predefined Price ID
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
        client_reference_id: userId, // still set for redundancy
        customer_creation: 'always',
        customer_email: customerEmail,
        // Auto-prefill customer data
        customer_update: {
          name: 'auto',
          address: 'auto',
        },
        phone_number_collection: { enabled: true },
        metadata: {
          email: customerEmail,
          plan: selectedPlan,
        },
        subscription_data: {
          metadata: {
            email: customerEmail,
            plan: selectedPlan,
          },
        },
      });

      return NextResponse.json({ sessionId: session.id });
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
