import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';

// Background worker for continuous posting
export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { productId, accountId, settings } = await req.json();
    
    if (!productId || !accountId) {
      return NextResponse.json({ error: 'Missing productId or accountId' }, { status: 400 });
    }

    // Default settings for continuous posting
    const postingSettings = {
      enabled: settings?.enabled ?? false,
      intervalMinutes: settings?.intervalMinutes ?? 30, // Post every 30 minutes
      maxPostsPerDay: settings?.maxPostsPerDay ?? 10,
      onlyHighScoreReplies: settings?.onlyHighScoreReplies ?? true, // Only post replies with >80% relevance
      ...settings
    };

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Store automation settings in database
    const { data, error } = await supabaseAdmin
      .from('auto_poster_configs')
      .upsert({
        user_id: userId,
        product_id: productId,
        account_id: accountId,
        enabled: postingSettings.enabled,
        interval_minutes: postingSettings.intervalMinutes,
        max_posts_per_day: postingSettings.maxPostsPerDay,
        only_high_score_replies: postingSettings.onlyHighScoreReplies,
        min_relevance_score: postingSettings.onlyHighScoreReplies ? 80 : 0,
        min_validation_score: postingSettings.onlyHighScoreReplies ? 75 : 0,
        status: postingSettings.enabled ? 'active' : 'paused'
      }, {
        onConflict: 'user_id,product_id,account_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Auto-posting ${postingSettings.enabled ? 'enabled' : 'disabled'}`,
      config: data
    });

  } catch (error) {
    console.error('Auto-poster setup error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Get automation status
export async function GET(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Fetch from database
    const { data: config, error } = await supabaseAdmin
      .from('auto_poster_configs')
      .select('*')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 });
    }

    const responseConfig = config ? {
      enabled: config.enabled,
      intervalMinutes: config.interval_minutes,
      maxPostsPerDay: config.max_posts_per_day,
      onlyHighScoreReplies: config.only_high_score_replies,
      postsToday: config.posts_today,
      lastPostedAt: config.last_posted_at,
      nextPostAt: config.next_post_at
    } : {
      enabled: false,
      intervalMinutes: 30,
      maxPostsPerDay: 10,
      onlyHighScoreReplies: true,
      postsToday: 0,
      lastPostedAt: null,
      nextPostAt: null
    };

    return NextResponse.json({ success: true, config: responseConfig });

  } catch (error) {
    console.error('Auto-poster status error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
