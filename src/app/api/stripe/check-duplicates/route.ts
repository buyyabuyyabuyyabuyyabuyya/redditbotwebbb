import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's email from Clerk
    const { clerkClient } = await import('@clerk/nextjs/server');
    const user = await clerkClient.users.getUser(userId);
    const userEmail = user.emailAddresses[0]?.emailAddress;

    if (!userEmail) {
      return NextResponse.json({ error: 'No email found' }, { status: 400 });
    }

    // Search for customers with this email
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 100, // Increase limit to catch all duplicates
    });

    const duplicateInfo = {
      hasDuplicates: customers.data.length > 1,
      customerCount: customers.data.length,
      customers: customers.data.map(customer => ({
        id: customer.id,
        email: customer.email,
        created: new Date(customer.created * 1000).toISOString(),
        subscriptions: [], // We'll populate this below
      })),
    };

    // Get subscription details for each customer
    for (const customer of duplicateInfo.customers) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'all',
      });
      
      customer.subscriptions = subscriptions.data.map(sub => ({
        id: sub.id,
        status: sub.status,
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        plan_name: sub.items.data[0]?.price?.nickname || 'Unknown',
        amount: sub.items.data[0]?.price?.unit_amount || 0,
      }));
    }

    return NextResponse.json(duplicateInfo);
  } catch (error) {
    console.error('Error checking duplicate customers:', error);
    return NextResponse.json(
      { error: 'Failed to check duplicates' },
      { status: 500 }
    );
  }
}
