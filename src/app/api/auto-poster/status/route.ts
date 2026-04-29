import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

          return {
            id: config.id,
            websiteConfigId: config.website_config_id,
            isRunning: config.enabled === true && config.status === 'active',
            nextPostTime: config.next_post_at || null,
            lastPostTime: config.last_posted_at || null,
            postsToday: config.posts_today || 0,
            totalPosts: totalPosts || 0,
            intervalMinutes: config.interval_minutes || 30,
            maxPostsPerDay: config.max_posts_per_day || 10,
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

    const isRunning =
      autoposterConfig.enabled === true && autoposterConfig.status === 'active';

    return NextResponse.json({
      isRunning,
      nextPostTime: autoposterConfig.next_post_at || null,
      postsToday: postsToday || 0,
      totalPosts: totalPosts || 0,
      lastPostTime:
        lastPost?.created_at || autoposterConfig.last_posted_at || null,
      lastCommentUrl: lastPost?.comment_url || null,
      lastPostResult: isRunning ? 'Running' : 'Stopped',
      currentWebsiteConfig: config,
      intervalMinutes: autoposterConfig.interval_minutes || 30,
      maxPostsPerDay: autoposterConfig.max_posts_per_day || 10,
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
