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
    const { data: autoposterConfig, error: autoposterError } = await supabaseAdmin
      .from('auto_poster_configs')
      .select(`
        *,
        reddit_accounts(username, status)
      `)
      .eq('user_id', userId)
      .eq('product_id', websiteConfigId)
      .single();

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

    return NextResponse.json({
      isRunning: autoposterConfig?.enabled && autoposterConfig?.status === 'active',
      nextPostTime: autoposterConfig?.next_post_at || null,
      postsToday: autoposterConfig?.posts_today || 0,
      lastPostResult: autoposterConfig?.status === 'active' ? 'Running...' : 'Stopped',
      currentWebsiteConfig: config,
      intervalMinutes: autoposterConfig?.interval_minutes || 30,
      maxPostsPerDay: autoposterConfig?.max_posts_per_day || 10,
      redditAccount: autoposterConfig?.reddit_accounts?.username || 'No account assigned'
    });

  } catch (error) {
    console.error('Error fetching auto-poster status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
