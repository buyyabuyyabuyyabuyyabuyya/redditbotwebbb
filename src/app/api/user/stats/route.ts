import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
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

async function getUserCommentCounts(userId: string, monthStartIso: string) {
  const { data: configs, error: configsError } = await supabaseAdmin
    .from('website_configs')
    .select('id')
    .eq('user_id', userId);

  if (configsError) {
    throw new Error(configsError.message);
  }

  const configIds = (configs || []).map((config) => config.id);
  if (configIds.length === 0) {
    return { total: 0, monthly: 0 };
  }

  const [{ count: total, error: totalError }, { count: monthly, error: monthlyError }] =
    await Promise.all([
      supabaseAdmin
        .from('posted_reddit_discussions')
        .select('id', { count: 'exact', head: true })
        .in('website_config_id', configIds),
      supabaseAdmin
        .from('posted_reddit_discussions')
        .select('id', { count: 'exact', head: true })
        .in('website_config_id', configIds)
        .gte('created_at', monthStartIso),
    ]);

  if (totalError || monthlyError) {
    throw new Error(totalError?.message || monthlyError?.message);
  }

  return {
    total: total || 0,
    monthly: monthly || 0,
  };
}

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

    let commentCounts;
    try {
      commentCounts = await getUserCommentCounts(userId, monthStart.toISOString());
    } catch (countError: any) {
      return NextResponse.json(
        {
          error: `Database error: ${countError?.message || 'Failed to count comments'}`,
        },
        { status: 500 }
      );
    }

    const subscriptionStatus = userStatsData?.subscription_status || 'free';
    const limits = getPlanLimits(subscriptionStatus);
    const usageCount = commentCounts.monthly;
    const remaining = Math.max(0, limits.monthlyCommentLimit - usageCount);

    return NextResponse.json({
      subscription_status: subscriptionStatus,
      message_count: userStatsData?.message_count || 0,
      usage_count: usageCount,
      comment_count: commentCounts.total,
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
