import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { getWebsiteConfigSubreddits } from '@/lib/websiteConfigCollections';
import { getPlanLimits } from '@/utils/planLimits';
import { getAutoPosterRunLimitState } from '@/lib/autoPosterRunLimit';

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
      return NextResponse.json(
        { error: 'Website config ID is required' },
        { status: 400 }
      );
    }

    // Verify the website config exists and belongs to the user
    const { data: config, error: configError } = await supabaseAdmin
      .from('website_configs')
      .select('*')
      .eq('id', websiteConfigId)
      .eq('user_id', userId)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { error: 'Website config not found' },
        { status: 404 }
      );
    }

    const { data: userRecord } = await supabaseAdmin
      .from('users')
      .select('subscription_status')
      .eq('id', userId)
      .maybeSingle();
    const limits = getPlanLimits(userRecord?.subscription_status);

    const { data: existingAutoPoster } = await supabaseAdmin
      .from('auto_poster_configs')
      .select('id, status, enabled, posts_today, last_reset_date, current_subreddit_index, run_started_at, created_at')
      .eq('user_id', userId)
      .eq('website_config_id', config.id)
      .limit(1)
      .maybeSingle();

    const existingRunState = getAutoPosterRunLimitState(existingAutoPoster);
    if (existingAutoPoster?.enabled && existingAutoPoster.status === 'active') {
      if (existingRunState.runtimeLimitReached) {
        await supabaseAdmin
          .from('auto_poster_configs')
          .update({
            enabled: false,
            status: 'paused',
            next_post_at: null,
            run_started_at: null,
          })
          .eq('id', existingAutoPoster.id);
      } else {
        return NextResponse.json(
          {
            error: 'auto_poster_already_running',
            message:
              'This website config already has an active auto-poster run. Stop it before starting another run.',
            runStartedAt: existingRunState.runStartedAt,
            runExpiresAt: existingRunState.runExpiresAt,
          },
          { status: 409 }
        );
      }
    }

    if (
      !existingAutoPoster?.enabled ||
      existingAutoPoster.status !== 'active' ||
      existingRunState.runtimeLimitReached
    ) {
      const { count: activeAutoPosterCount, error: countError } =
        await supabaseAdmin
          .from('auto_poster_configs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('enabled', true)
          .eq('status', 'active');

      if (countError) {
        console.error('Error checking auto-poster limit:', countError);
        return NextResponse.json(
          { error: 'Failed to check auto-poster limit' },
          { status: 500 }
        );
      }

      if ((activeAutoPosterCount || 0) >= limits.maxAutoPosters) {
        return NextResponse.json(
          {
            error: 'auto_poster_limit_reached',
            limit: limits.maxAutoPosters,
            current: activeAutoPosterCount || 0,
            message: `Your plan allows ${limits.maxAutoPosters} active auto-poster${limits.maxAutoPosters === 1 ? '' : 's'}.`,
          },
          { status: 403 }
        );
      }
    }

    const subredditRotation = getWebsiteConfigSubreddits(config);
    if (subredditRotation.length === 0) {
      return NextResponse.json(
        {
          error: 'no_subreddits_configured',
          message: 'Add at least one target subreddit to this website config before starting the auto-poster.',
        },
        { status: 400 }
      );
    }

    // Update the config to enable auto-posting
    const { error: updateError } = await supabaseAdmin
      .from('website_configs')
      .update({
        auto_poster_enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', websiteConfigId);

    if (updateError) {
      console.error('Error enabling auto-poster:', updateError);
      return NextResponse.json(
        { error: 'Failed to start auto-poster' },
        { status: 500 }
      );
    }

    // Get first available platform-managed Reddit account.
    const { data: account } = await supabaseAdmin
      .from('reddit_accounts')
      .select('*')
      .eq('is_discussion_poster', true)
      .eq('is_validated', true)
      .eq('is_available', true)
      .order('last_used_at', { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle();

    if (!account) {
      return NextResponse.json(
        { error: 'No managed posting network accounts are available' },
        { status: 400 }
      );
    }

    // Create auto-poster config entry
    const today = new Date().toISOString().split('T')[0];
    const existingPostsToday =
      existingAutoPoster?.last_reset_date === today
        ? existingAutoPoster.posts_today || 0
        : 0;

    const autoPosterPayload = {
      user_id: userId,
      website_config_id: config.id, // Use website config UUID
      product_id: null, // Deprecate legacy product_id column
      account_id: account.id,
      enabled: true,
      interval_minutes: 30,
      status: 'active',
      next_post_at: new Date().toISOString(), // Post immediately
      posts_today: existingPostsToday,
      current_subreddit_index: existingAutoPoster?.current_subreddit_index || 0,
      last_subreddit_used: subredditRotation[0],
      last_reset_date: today,
      run_started_at: new Date().toISOString(),
    };

    const autoPosterMutation = existingAutoPoster
      ? supabaseAdmin
          .from('auto_poster_configs')
          .update(autoPosterPayload)
          .eq('id', existingAutoPoster.id)
      : supabaseAdmin
          .from('auto_poster_configs')
          .insert(autoPosterPayload);

    const { error: autoposterError } = await autoPosterMutation;

    if (autoposterError) {
      console.error('Error creating auto-poster config:', autoposterError);
      return NextResponse.json(
        { error: 'Failed to create auto-poster config' },
        { status: 500 }
      );
    }

    // Verify the config was created/updated successfully
    const { data: verifyConfig, error: verifyError } = await supabaseAdmin
      .from('auto_poster_configs')
      .select('*')
      .eq('user_id', userId)
      .eq('website_config_id', config.id)
      .single();

    if (verifyError || !verifyConfig) {
      console.error(
        'Failed to verify auto-poster config creation:',
        verifyError
      );
      return NextResponse.json(
        { error: 'Auto-poster config verification failed' },
        { status: 500 }
      );
    }

    console.log('[AUTO_POSTER_START] Config verified:', {
      enabled: verifyConfig.enabled,
      status: verifyConfig.status,
      next_post_at: verifyConfig.next_post_at,
    });

    // Auto-create Upstash cron job with internal auth
    try {
      const cronResponse = await fetch(
        `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/upstash/setup-cron`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-API': 'true',
            'X-User-ID': userId,
          },
          body: JSON.stringify({
            productId: config.id,
            accountId: account.id,
            intervalMinutes: 30, // Check every 30 minutes
          }),
        }
      );

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
      config: config,
    });
  } catch (error) {
    console.error('Error starting auto-poster:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
