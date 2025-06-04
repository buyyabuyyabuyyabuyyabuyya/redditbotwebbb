import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase admin client with service role key for bypassing RLS
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

// GET handler for retrieving user stats
export async function GET(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user subscription status
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('subscription_status')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
      return NextResponse.json(
        { error: `Database error: ${userError.message}` },
        { status: 500 }
      );
    }

    // Count messages sent directly from the sent_messages table for real-time accuracy
    const { count: messageCount, error: messageError } = await supabaseAdmin
      .from('sent_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (messageError) {
      console.error('Error counting messages:', messageError);
      return NextResponse.json(
        { error: `Database error: ${messageError.message}` },
        { status: 500 }
      );
    }

    const subscriptionStatus = userData?.subscription_status || 'free';
    const messagesRemaining =
      subscriptionStatus === 'free'
        ? Math.max(0, 15 - (messageCount || 0))
        : null;

    // Return the user stats
    return NextResponse.json({
      subscription_status: subscriptionStatus,
      message_count: messageCount || 0,
      remaining: messagesRemaining,
      is_pro: subscriptionStatus === 'pro',
    });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
