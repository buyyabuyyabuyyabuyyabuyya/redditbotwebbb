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
      return NextResponse.json({ error: 'Website config ID is required' }, { status: 400 });
    }

    // Get auto-poster config with website config details
    // BACKWARD COMPATIBILITY: Query by both product_id (legacy) and website_config_id (new)
    console.log(`[STATUS_CHECK] Querying for websiteConfigId: ${websiteConfigId}`);

    const { data: autoposterConfig, error: autoposterError } = await supabaseAdmin
      .from('auto_poster_configs')
      .select(`
        *,
        reddit_accounts(username, status)
      `)
      .eq('user_id', userId)
      .or(`product_id.eq.${websiteConfigId},website_config_id.eq.${websiteConfigId}`)
      .maybeSingle();

    console.log('[STATUS_CHECK] Query result:', {
      found: !!autoposterConfig,
      product_id: autoposterConfig?.product_id,
      website_config_id: autoposterConfig?.website_config_id,
      enabled: autoposterConfig?.enabled,
      status: autoposterConfig?.status
    });

    if (autoposterError && autoposterError.code !== 'PGRST116') {
      console.error('Error fetching auto-poster config:', autoposterError);
      return NextResponse.json({ error: 'Failed to fetch auto-poster status' }, { status: 500 });
    }

    // Get website config
    const { data: config, error: configError } = await supabaseAdmin
      .from('website_configs')
      .select('*')
      .eq('id', websiteConfigId)
      .eq('user_id', userId)
      .single();

    if (configError) {
      console.error('Error fetching website config:', configError);
      return NextResponse.json({ error: 'Website config not found' }, { status: 404 });
    }

    // Get today's post count from auto-posting logs
    const today = new Date().toISOString().split('T')[0];
    const { count: postsToday } = await supabaseAdmin
      .from('auto_posting_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lt('created_at', `${today}T23:59:59.999Z`)
      .eq('status', 'posted');

    // Default response if no autoposter config found
    const defaultResponse = {
      isRunning: false,
      nextPostTime: null,
      postsToday: 0,
      lastPostResult: 'Not started',
      currentWebsiteConfig: config,
      intervalMinutes: 30,
      maxPostsPerDay: 10,
      redditAccount: 'No account assigned'
    };

    // If no autoposter config exists, return default
    if (!autoposterConfig) {
      return NextResponse.json(defaultResponse);
    }

    // Check if auto-poster is actually running
    const isRunning = autoposterConfig.enabled === true && autoposterConfig.status === 'active';

    console.log('[STATUS_CHECK]', {
      websiteConfigId,
      enabled: autoposterConfig.enabled,
      status: autoposterConfig.status,
      isRunning,
      next_post_at: autoposterConfig.next_post_at
    });

    return NextResponse.json({
      isRunning,
      nextPostTime: autoposterConfig.next_post_at || null,
      postsToday: autoposterConfig.posts_today || 0,
      lastPostResult: isRunning ? 'Running...' : 'Stopped',
      currentWebsiteConfig: config,
      intervalMinutes: autoposterConfig.interval_minutes || 30,
      maxPostsPerDay: autoposterConfig.max_posts_per_day || 10,
      redditAccount: autoposterConfig.reddit_accounts?.username || 'No account assigned'
    });

  } catch (error) {
    console.error('Error fetching auto-poster status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
