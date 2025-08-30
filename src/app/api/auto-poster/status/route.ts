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

    // Get auto-poster status
    const { data: status, error: statusError } = await supabaseAdmin
      .from('auto_poster_status')
      .select('*')
      .eq('user_id', userId)
      .eq('website_config_id', websiteConfigId)
      .single();

    if (statusError && statusError.code !== 'PGRST116') {
      console.error('Error fetching auto-poster status:', statusError);
      return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
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

    // Get today's post count
    const today = new Date().toISOString().split('T')[0];
    const { count: postsToday } = await supabaseAdmin
      .from('posted_reddit_discussions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lt('created_at', `${today}T23:59:59.999Z`);

    return NextResponse.json({
      isRunning: status?.is_running || false,
      nextPostTime: status?.next_post_time || null,
      postsToday: postsToday || 0,
      lastPostResult: status?.last_post_result || null,
      currentWebsiteConfig: config,
      startedAt: status?.started_at || null,
      stoppedAt: status?.stopped_at || null
    });

  } catch (error) {
    console.error('Error fetching auto-poster status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
