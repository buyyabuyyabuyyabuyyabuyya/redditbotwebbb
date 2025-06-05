import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// Supabase admin client (bypasses RLS) for webhook processing
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(req: Request) {
  const supabase = supabaseAdmin;

  try {
    // Read the raw body as a buffer for Stripe signature verification
    const rawBody = await req.arrayBuffer();
    const body = Buffer.from(rawBody);

    const signature = headers().get('stripe-signature');
    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // Prefer metadata.userId if available (for Payment Links) otherwise client_reference_id
        let userId = session.metadata?.userId || session.client_reference_id;

        // Fallback: resolve via customer email using clerk_emails directory
        if (!userId && session.customer_details?.email) {
          const { data: dir } = await supabase
            .from('clerk_emails')
            .select('user_id')
            .eq('email', session.customer_details.email.toLowerCase())
            .single();
          userId = dir?.user_id || undefined;
        }

        if (!userId) {
          console.warn('Unable to resolve user for checkout.session.completed event:', session.id);
          break; // Skip processing if userId is still missing
        }

        // Default to 'pro', will update if advanced detected
        let newStatus: 'pro' | 'advanced' = 'pro';
        let priceId: string | null = null;

        if (session.mode === 'subscription' && session.subscription) {
          // Retrieve subscription items to extract price ID
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          if (subscription.items.data.length > 0) {
            priceId = subscription.items.data[0].price.id;
          }
        }

        if (priceId === 'price_1RWAeqPBL9IyGFhJCnaG18Gi') {
          newStatus = 'advanced';
        } else if (priceId === 'price_1RWAVQPBL9IyGFhJuNep8Htw') {
          newStatus = 'pro';
        }

        // Update user's subscription status in DB (users.id is pk)
        const { error } = await supabase
          .from('users')
          .update({ subscription_status: newStatus })
          .eq('user_id', userId);

        if (error) {
          console.error('Error updating user subscription:', error);
          throw error;
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        let userId = subscription.metadata?.userId;

        // Fallback via email stored on customer object
        if (!userId && subscription.customer) {
          // Retrieve customer to get email
          const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;
          if (customer.email) {
            const { data: dir } = await supabase
              .from('clerk_emails')
              .select('user_id')
              .eq('email', customer.email.toLowerCase())
              .single();
            userId = dir?.user_id || undefined;
          }
        }

        if (!userId) {
          console.warn('Unable to resolve user for customer.subscription.deleted event:', subscription.id);
          break;
        }

        // Update user's subscription status
        const { error } = await supabase
          .from('users')
          .update({ subscription_status: 'free' })
          .eq('user_id', userId);

        if (error) {
          console.error('Error updating user subscription:', error);
          throw error;
        }

        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}