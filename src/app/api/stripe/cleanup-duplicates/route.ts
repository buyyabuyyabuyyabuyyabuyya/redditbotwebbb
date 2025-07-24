import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    console.log(`[CLEANUP] Starting duplicate cleanup for email: ${email}`);

    // Find all customers with this email
    const customers = await stripe.customers.list({
      email: email.toLowerCase(),
      limit: 20,
    });

    console.log(`[CLEANUP] Found ${customers.data.length} customers`);

    let allSubscriptions: Stripe.Subscription[] = [];
    let customerInfo: { customerId: string; created: number }[] = [];

    // Get all subscriptions for all customers
    for (const customer of customers.data) {
      customerInfo.push({
        customerId: customer.id,
        created: customer.created
      });

      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'all',
        limit: 10,
      });

      // Filter for active subscriptions
      const activeSubscriptions = subscriptions.data.filter(sub => 
        ['active', 'past_due', 'unpaid'].includes(sub.status)
      );

      allSubscriptions = [...allSubscriptions, ...activeSubscriptions];
    }

    console.log(`[CLEANUP] Found ${allSubscriptions.length} active subscriptions`);

    if (allSubscriptions.length <= 1) {
      return NextResponse.json({ 
        message: 'No duplicates found', 
        subscriptions: allSubscriptions.length 
      });
    }

    // Sort subscriptions by creation date (newest first)
    allSubscriptions.sort((a, b) => b.created - a.created);

    // Keep the newest subscription, cancel the rest
    const newestSubscription = allSubscriptions[0];
    const duplicateSubscriptions = allSubscriptions.slice(1);

    console.log(`[CLEANUP] Keeping newest subscription: ${newestSubscription.id}`);
    console.log(`[CLEANUP] Canceling ${duplicateSubscriptions.length} duplicate subscriptions`);

    const cancelResults = [];

    for (const subscription of duplicateSubscriptions) {
      try {
        console.log(`[CLEANUP] Canceling subscription: ${subscription.id}`);
        
        const canceledSub = await stripe.subscriptions.cancel(subscription.id, {
          prorate: false, // Don't prorate
          invoice_now: false // Don't create invoice
        });

        cancelResults.push({
          subscriptionId: subscription.id,
          status: 'canceled',
          customerId: subscription.customer,
          amount: subscription.items.data[0]?.price.unit_amount || 0
        });

        console.log(`[CLEANUP] Successfully canceled: ${subscription.id}`);
      } catch (error) {
        console.error(`[CLEANUP] Error canceling ${subscription.id}:`, error);
        cancelResults.push({
          subscriptionId: subscription.id,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Calculate savings
    const monthlySavings = duplicateSubscriptions.reduce((total, sub) => {
      return total + (sub.items.data[0]?.price.unit_amount || 0);
    }, 0) / 100; // Convert from cents to dollars

    const response = {
      message: 'Duplicate cleanup completed',
      keptSubscription: {
        id: newestSubscription.id,
        customerId: newestSubscription.customer,
        amount: (newestSubscription.items.data[0]?.price.unit_amount || 0) / 100
      },
      canceledSubscriptions: cancelResults,
      totalCanceled: duplicateSubscriptions.length,
      monthlySavings: monthlySavings,
      customers: customerInfo
    };

    console.log('[CLEANUP] Cleanup completed:', response);

    return NextResponse.json(response);

  } catch (error) {
    console.error('[CLEANUP] Error during cleanup:', error);
    return NextResponse.json({ 
      error: 'Cleanup failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
