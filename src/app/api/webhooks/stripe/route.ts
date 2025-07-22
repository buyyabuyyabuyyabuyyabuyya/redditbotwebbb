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

// Helper: resolve user ID from clerk email directory
async function resolveUserIdByEmail(email: string): Promise<string | undefined> {
  const { data } = await supabaseAdmin
    .from('clerk_emails')
    .select('user_id')
    .eq('email', email.toLowerCase())
    .single();
  return data?.user_id;
}

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

        // Fallback: resolve via customer email using Clerk API
        if (!userId && session.customer_details?.email) {
          try {
            const { clerkClient } = await import('@clerk/nextjs/server');
            const users = await clerkClient.users.getUserList({
              emailAddress: [session.customer_details.email.toLowerCase()]
            });
            
            if (users.data.length > 0) {
              userId = users.data[0].id;
              console.log('Resolved user ID via Clerk API:', userId);
            }
          } catch (clerkError) {
            console.error('Error resolving user via Clerk:', clerkError);
            
            // Fallback to clerk_emails table
            const { data: dir } = await supabase
              .from('clerk_emails')
              .select('user_id')
              .eq('email', session.customer_details.email.toLowerCase())
              .single();
            userId = dir?.user_id || undefined;
          }
        }

        if (!userId) {
          console.warn('Unable to resolve user for checkout.session.completed event:', session.id);
          break; // Skip processing if userId is still missing
        }

        // Ensure user exists in our database - create if not exists
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('id', userId)
          .single();

        if (!existingUser) {
          console.log('Creating new user record for:', userId);
          const { error: createError } = await supabase
            .from('users')
            .insert({
              id: userId,
              subscription_status: 'free',
              message_count: 0,
              created_at: new Date().toISOString()
            });
          
          if (createError) {
            console.error('Error creating user record:', createError);
            // Continue anyway - the update might still work
          }
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

        // Reset message_count for new subscription
        const updatePayload: Record<string, any> = { 
          subscription_status: newStatus, 
          message_count: 0 
        };
        
        if (session.mode === 'subscription' && session.subscription) {
          const subscriptionDetails = await stripe.subscriptions.retrieve(session.subscription as string);
          if (subscriptionDetails.subscription_period_end) {
            updatePayload.subscription_period_end = new Date(subscriptionDetails.subscription_period_end * 1000).toISOString();
          }
        }

        const { error } = await supabase
          .from('users')
          .upsert({
            id: userId,
            ...updatePayload,
            created_at: new Date().toISOString()
          }, {
            onConflict: 'id'
          });

        if (error) {
          console.error('Error updating user subscription:', error);
          throw error;
        }

        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;

        // Only act on recurring subscription invoices
        if (invoice.billing_reason !== 'subscription_cycle' || !invoice.subscription) {
          break;
        }

        let userId = invoice.metadata?.userId;
        if (!userId && invoice.customer_email) {
          userId = await resolveUserIdByEmail(invoice.customer_email);
        }

        if (!userId) {
          console.warn('Unable to resolve user for invoice.payment_succeeded:', invoice.id);
          break;
        }

        const { period_start, period_end } = invoice;
        await supabase
          .from('users')
          .update({
            message_count: 0,
            message_count_reset_at: new Date(period_start * 1000).toISOString(),
            subscription_period_end: new Date(period_end * 1000).toISOString(),
          })
          .eq('id', userId);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        let userId = subscription.metadata?.userId;

        if (!userId && subscription.customer) {
          const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;
          if (customer.email) {
            userId = await resolveUserIdByEmail(customer.email);
          }
        }

        if (!userId) {
          console.warn('Unable to resolve user for customer.subscription.updated:', subscription.id);
          break;
        }

        if (subscription.cancel_at_period_end && subscription.current_period_end) {
          await supabase
            .from('users')
            .update({ subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString() })
            .eq('id', userId);
        } else if (['past_due', 'unpaid', 'incomplete_expired', 'canceled'].includes(subscription.status)) {
          await supabase
            .from('users')
            .update({ subscription_status: 'free' })
            .eq('id', userId);
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
          .eq('id', userId);

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