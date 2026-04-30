import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getNextDailyResetIso(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 5, 0, 0);
  return tomorrow.toISOString();
}

function getDailyLimitState(config?: {
  posts_today?: number | null;
  max_posts_per_day?: number | null;
} | null) {
  const postsToday = config?.posts_today || 0;
  const maxPostsPerDay = config?.max_posts_per_day || 10;
  const dailyLimitReached = postsToday >= maxPostsPerDay;

  return {
    postsToday,
    maxPostsPerDay,
    dailyLimitReached,
    nextDailyResetAt: dailyLimitReached ? getNextDailyResetIso() : null,
    statusLabel: dailyLimitReached ? 'Daily limit reached' : null,
    statusMessage: dailyLimitReached
      ? `This auto-poster has reached its ${maxPostsPerDay} comments/day limit for this website config. It will resume after the daily reset.`
      : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const websiteConfigId = searchParams.get('websiteConfigId');

    if (!websiteConfigId) {
      const { data: configs, error } = await supabaseAdmin
        .from('auto_poster_configs')
        .select(
          `
          id,
          website_config_id,
          enabled,
          status,
          next_post_at,
          last_posted_at,
          interval_minutes,
          max_posts_per_day,
          posts_today,
          reddit_accounts(username),
          website_configs!inner(id, website_url, website_description, user_id)
        `
        )
        .eq('user_id', userId)
        .eq('website_configs.user_id', userId)
        .eq('enabled', true)
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json(
          { error: 'Failed to fetch auto-poster status' },
          { status: 500 }
        );
      }

      const normalized = await Promise.all(
        (configs || []).map(async (config: any) => {
          const { count: totalPosts } = await supabaseAdmin
            .from('posted_reddit_discussions')
            .select('id', { count: 'exact', head: true })
            .eq('website_config_id', config.website_config_id);
          const dailyLimitState = getDailyLimitState(config);
          const isRunning =
            config.enabled === true &&
            config.status === 'active' &&
            !dailyLimitState.dailyLimitReached;

          return {
            id: config.id,
            websiteConfigId: config.website_config_id,
            isRunning,
            dailyLimitReached: dailyLimitState.dailyLimitReached,
            statusLabel:
              dailyLimitState.statusLabel ||
              (isRunning ? 'Running' : 'Stopped'),
            statusMessage: dailyLimitState.statusMessage,
            nextDailyResetAt: dailyLimitState.nextDailyResetAt,
            nextPostTime: dailyLimitState.dailyLimitReached
              ? dailyLimitState.nextDailyResetAt
              : config.next_post_at || null,
            lastPostTime: config.last_posted_at || null,
            postsToday: dailyLimitState.postsToday,
            totalPosts: totalPosts || 0,
            intervalMinutes: config.interval_minutes || 30,
            maxPostsPerDay: dailyLimitState.maxPostsPerDay,
            redditAccount: 'Managed network',
            currentWebsiteConfig: config.website_configs,
          };
        })
      );

      return NextResponse.json({ configs: normalized });
    }

    const { data: config, error: configError } = await supabaseAdmin
      .from('website_configs')
      .select('*')
      .eq('id', websiteConfigId)
      .eq('user_id', userId)
      .single();

    if (configError) {
      return NextResponse.json(
        { error: 'Website config not found' },
        { status: 404 }
      );
    }

    const { data: autoposterConfig, error: autoposterError } =
      await supabaseAdmin
        .from('auto_poster_configs')
        .select(
          `
        *,
        reddit_accounts(username, status)
      `
        )
        .eq('user_id', userId)
        .or(
          `product_id.eq.${websiteConfigId},website_config_id.eq.${websiteConfigId}`
        )
        .maybeSingle();

    if (autoposterError && autoposterError.code !== 'PGRST116') {
      return NextResponse.json(
        { error: 'Failed to fetch auto-poster status' },
        { status: 500 }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [
      { count: postsToday },
      { count: totalPosts },
      { data: lastPostRows },
    ] = await Promise.all([
      supabaseAdmin
        .from('posted_reddit_discussions')
        .select('id', { count: 'exact', head: true })
        .eq('website_config_id', websiteConfigId)
        .gte('created_at', today.toISOString()),
      supabaseAdmin
        .from('posted_reddit_discussions')
        .select('id', { count: 'exact', head: true })
        .eq('website_config_id', websiteConfigId),
      supabaseAdmin
        .from('posted_reddit_discussions')
        .select('created_at, comment_url')
        .eq('website_config_id', websiteConfigId)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    const lastPost = lastPostRows?.[0] || null;

    if (!autoposterConfig) {
      return NextResponse.json({
        isRunning: false,
        nextPostTime: null,
        postsToday: postsToday || 0,
        totalPosts: totalPosts || 0,
        lastPostTime: lastPost?.created_at || null,
        lastCommentUrl: lastPost?.comment_url || null,
        lastPostResult: 'Not started',
        currentWebsiteConfig: config,
        intervalMinutes: 30,
        maxPostsPerDay: 10,
        redditAccount: 'Managed network',
      });
    }

    const dailyLimitState = getDailyLimitState(autoposterConfig);
    const isRunning =
      autoposterConfig.enabled === true &&
      autoposterConfig.status === 'active' &&
      !dailyLimitState.dailyLimitReached;

    return NextResponse.json({
      isRunning,
      dailyLimitReached: dailyLimitState.dailyLimitReached,
      statusLabel:
        dailyLimitState.statusLabel || (isRunning ? 'Running' : 'Stopped'),
      statusMessage: dailyLimitState.statusMessage,
      nextDailyResetAt: dailyLimitState.nextDailyResetAt,
      nextPostTime: dailyLimitState.dailyLimitReached
        ? dailyLimitState.nextDailyResetAt
        : autoposterConfig.next_post_at || null,
      postsToday: dailyLimitState.postsToday || postsToday || 0,
      totalPosts: totalPosts || 0,
      lastPostTime:
        lastPost?.created_at || autoposterConfig.last_posted_at || null,
      lastCommentUrl: lastPost?.comment_url || null,
      lastPostResult:
        dailyLimitState.statusLabel || (isRunning ? 'Running' : 'Stopped'),
      currentWebsiteConfig: config,
      intervalMinutes: autoposterConfig.interval_minutes || 30,
      maxPostsPerDay: dailyLimitState.maxPostsPerDay,
      redditAccount: 'Managed network',
    });
  } catch (error) {
    console.error('Error fetching auto-poster status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
