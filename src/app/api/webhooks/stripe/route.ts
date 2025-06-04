import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

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

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

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
        const userId = session.metadata?.userId || session.client_reference_id;

        if (!userId) {
          console.warn(
            'No user ID in session for checkout.session.completed event:',
            session.id
          );
          break; // Skip processing if userId is missing
        }

        // Default to 'pro', will update if advanced detected
        let newStatus: 'pro' | 'advanced' = 'pro';
        let priceId: string | null = null;

        if (session.mode === 'subscription' && session.subscription) {
          // Retrieve subscription items to extract price ID
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
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
        const userId = subscription.metadata?.userId;

        if (!userId) {
          console.warn(
            'No user ID in subscription for customer.subscription.deleted event:',
            subscription.id
          );
          break; // Skip processing if userId is missing
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
