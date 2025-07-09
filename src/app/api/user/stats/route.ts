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
    // Verify authentication with Clerk first; fall back to X-User-Id header (useful for client-side token pass-through)
    let { userId } = await auth();
    if (!userId) {
      const hdrUser = req.headers.get('x-user-id');
      if (hdrUser) {
        userId = hdrUser;
      }
    }
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // If message_count_reset_at is null, set it to created_at + 1 month (if created_at exists) or now +1 month
    if (!userData?.message_count_reset_at) {
      const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from('users').update({ message_count_reset_at: resetAt }).eq('id', userId);
      userData!.message_count_reset_at = resetAt;
    }

    // Get user's message count and subscription status (second query)
    const { data: userStatsData, error: userStatsError } = await supabaseAdmin
      .from('users')
      .select('subscription_status, message_count')
      .eq('id', userId)
      .maybeSingle();

    if (userError) {
      console.error('Error fetching user data:', userError);
      return NextResponse.json(
        { error: `Database error: ${userError.message}` },
        { status: 500 }
      );
    }

    const subscriptionStatus = userStatsData?.subscription_status || 'free';

    // Define monthly limits per plan (null means unlimited)
    const PLAN_LIMITS: Record<string, number | null> = {
      free: 15,
      pro: 200,
      advanced: null,
    };

    const planLimit = PLAN_LIMITS[subscriptionStatus] ?? 15;
    const messagesRemaining =
      planLimit === null ? null : Math.max(0, planLimit - (userStatsData?.message_count || 0));

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
