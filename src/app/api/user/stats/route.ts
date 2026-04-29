import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { getPlanLimits } from '@/utils/planLimits';

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

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { count: commentCount, error: commentCountError } =
      await supabaseAdmin
        .from('posted_reddit_discussions')
        .select('id, website_configs!inner(user_id)', {
          count: 'exact',
          head: true,
        })
        .eq('website_configs.user_id', userId);

    const { count: monthlyCommentCount, error: monthlyCommentCountError } =
      await supabaseAdmin
        .from('posted_reddit_discussions')
        .select('id, website_configs!inner(user_id)', {
          count: 'exact',
          head: true,
        })
        .eq('website_configs.user_id', userId)
        .gte('created_at', monthStart.toISOString());

    if (commentCountError || monthlyCommentCountError) {
      return NextResponse.json(
        {
          error: `Database error: ${
            commentCountError?.message || monthlyCommentCountError?.message
          }`,
        },
        { status: 500 }
      );
    }

    const subscriptionStatus = userStatsData?.subscription_status || 'free';
    const limits = getPlanLimits(subscriptionStatus);
    const usageCount = monthlyCommentCount || 0;
    const remaining = Math.max(0, limits.monthlyCommentLimit - usageCount);

    return NextResponse.json({
      subscription_status: subscriptionStatus,
      message_count: userStatsData?.message_count || 0,
      usage_count: usageCount,
      comment_count: commentCount || 0,
      monthly_comment_count: usageCount,
      limit: limits.monthlyCommentLimit,
      remaining,
      is_pro:
        subscriptionStatus === 'pro' ||
        subscriptionStatus === 'advanced' ||
        subscriptionStatus === 'elite',
      max_website_configs: limits.maxWebsiteConfigs,
      max_auto_posters: limits.maxAutoPosters,
      monthly_comment_limit: limits.monthlyCommentLimit,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
