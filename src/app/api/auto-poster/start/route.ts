import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { websiteConfigId } = await request.json();

    if (!websiteConfigId) {
      return NextResponse.json({ error: 'Website config ID is required' }, { status: 400 });
    }

    // Verify the website config exists and belongs to the user
    const { data: config, error: configError } = await supabaseAdmin
      .from('website_configs')
      .select('*')
      .eq('id', websiteConfigId)
      .eq('user_id', userId)
      .single();

    if (configError || !config) {
      return NextResponse.json({ error: 'Website config not found' }, { status: 404 });
    }

    // Update the config to enable auto-posting
    const { error: updateError } = await supabaseAdmin
      .from('website_configs')
      .update({
        auto_poster_enabled: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', websiteConfigId);

    if (updateError) {
      console.error('Error enabling auto-poster:', updateError);
      return NextResponse.json({ error: 'Failed to start auto-poster' }, { status: 500 });
    }

    // Get first available admin-controlled Reddit account
    const { data: account } = await supabaseAdmin
      .from('reddit_accounts')
      .select('*')
      .eq('is_discussion_poster', true)
      .eq('is_validated', true)
      .limit(1)
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ error: 'No Reddit accounts available for posting' }, { status: 400 });
    }

    // Create auto-poster config entry
    const { error: autoposterError } = await supabaseAdmin
      .from('auto_poster_configs')
      .upsert({
        user_id: userId,
        product_id: config.id, // Use website config ID as product ID
        account_id: account.id,
        enabled: true,
        interval_minutes: 30,
        max_posts_per_day: 10,
        status: 'active',
        next_post_at: new Date().toISOString(), // Post immediately
        posts_today: 0,
        last_reset_date: new Date().toISOString().split('T')[0]
      }, {
        onConflict: 'user_id,product_id,account_id'
      });

    if (autoposterError) {
      console.error('Error creating auto-poster config:', autoposterError);
      return NextResponse.json({ error: 'Failed to create auto-poster config' }, { status: 500 });
    }

    // Verify the config was created/updated successfully
    const { data: verifyConfig, error: verifyError } = await supabaseAdmin
      .from('auto_poster_configs')
      .select('*')
      .eq('user_id', userId)
      .eq('product_id', config.id)
      .eq('account_id', account.id)
      .single();

    if (verifyError || !verifyConfig) {
      console.error('Failed to verify auto-poster config creation:', verifyError);
      return NextResponse.json({ error: 'Auto-poster config verification failed' }, { status: 500 });
    }

    console.log('[AUTO_POSTER_START] Config verified:', {
      enabled: verifyConfig.enabled,
      status: verifyConfig.status,
      next_post_at: verifyConfig.next_post_at
    });

    // Auto-create Upstash cron job with internal auth
    try {
      const cronResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/upstash/setup-cron`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API': 'true',
          'X-User-ID': userId
        },
        body: JSON.stringify({
          productId: config.id,
          accountId: account.id,
          intervalMinutes: 15 // Check every 15 minutes
        })
      });

      if (!cronResponse.ok) {
        console.error('Failed to create Upstash cron job');
        // Continue anyway - manual fallback available
      }
    } catch (cronError) {
      console.error('Error setting up cron job:', cronError);
      // Continue anyway - manual fallback available
    }

    return NextResponse.json({
      success: true,
      message: 'Auto-poster started successfully',
      config: config
    });

  } catch (error) {
    console.error('Error starting auto-poster:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
