import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';

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

export async function GET(req: Request) {
  try {
    let { userId } = await auth();
    if (!userId) {
      const hdrUser = req.headers.get('x-user-id');
      if (hdrUser) userId = hdrUser;
    }
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userStatsData, error: userStatsError } = await supabaseAdmin
      .from('users')
      .select('subscription_status, message_count')
      .eq('id', userId)
      .maybeSingle();

    if (userStatsError) {
      return NextResponse.json(
        { error: `Database error: ${userStatsError.message}` },
        { status: 500 }
      );
    }

    const { count: commentCount, error: commentCountError } =
      await supabaseAdmin
        .from('posted_reddit_discussions')
        .select('id, website_configs!inner(user_id)', {
          count: 'exact',
          head: true,
        })
        .eq('website_configs.user_id', userId);

    if (commentCountError) {
      return NextResponse.json(
        { error: `Database error: ${commentCountError.message}` },
        { status: 500 }
      );
    }

    const subscriptionStatus = userStatsData?.subscription_status || 'free';
    const PLAN_LIMITS: Record<string, number | null> = {
      free: 15,
      pro: 200,
      advanced: null,
    };

    const planLimit = PLAN_LIMITS[subscriptionStatus] ?? 15;
    const usageCount = userStatsData?.message_count || 0;
    const remaining =
      planLimit === null ? null : Math.max(0, planLimit - usageCount);

    return NextResponse.json({
      subscription_status: subscriptionStatus,
      message_count: usageCount,
      usage_count: usageCount,
      comment_count: commentCount || 0,
      limit: planLimit,
      remaining,
      is_pro: subscriptionStatus === 'pro' || subscriptionStatus === 'advanced',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
