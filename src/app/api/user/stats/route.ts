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
    /*
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
*/
    // Get user subscription status
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('subscription_status')
      .eq('id', userId)
      .maybeSingle();

    if (userError) {
      console.error('Error fetching user data:', userError);
      return NextResponse.json(
        { error: `Database error: ${userError.message}` },
        { status: 500 }
      );
    }

    // Count messages sent this calendar month for real-time accuracy
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

    const { count: messageCount, error: messageError } = await supabaseAdmin
      .from('sent_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('sent_at', startOfMonth.toISOString());

    if (messageError) {
      console.error('Error counting messages:', messageError);
      return NextResponse.json(
        { error: `Database error: ${messageError.message}` },
        { status: 500 }
      );
    }

    const subscriptionStatus = userData?.subscription_status || 'free';

    // Define monthly limits per plan (null means unlimited)
    const PLAN_LIMITS: Record<string, number | null> = {
      free: 15,
      pro: 200,
      advanced: null,
    };

    const planLimit = PLAN_LIMITS[subscriptionStatus] ?? 15;
    const messagesRemaining =
      planLimit === null ? null : Math.max(0, planLimit - (messageCount || 0));

    // Return the user stats
    return NextResponse.json({
      subscription_status: subscriptionStatus,
      message_count: messageCount || 0,
      limit: planLimit,
      remaining: messagesRemaining,
      is_pro: subscriptionStatus === 'pro' || subscriptionStatus === 'advanced',
    });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
