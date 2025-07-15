import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerSupabaseClient } from '../../../../utils/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { publishQStashMessage, scheduleQStashMessage } from '../../../../utils/qstash';
import snoowrap from 'snoowrap';
import { ensureInboxSchedule } from '../../../../utils/inboxScheduler';
import { checkAndArchiveLogs } from '../auto-archive-helper';

// Inter-message delay (ms)
const DELAY_INTERVAL_MS = 100_000; // 100 s ≈ 1.7 min – safe for Reddit
const BATCH_SIZE = 10; // number of posts to queue per batch
const MAX_TOTAL_POSTS = 100; // upper-bound for a single scan session

export async function POST(req: Request) {
  try {
    const internal =
      req.headers.get('X-Internal-API') === 'true' ||
      req.headers.has('Upstash-Signature');
    const authRes = await auth();
    let userId = authRes?.userId || null;
    if (!internal && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { configId, remaining: remainingInput, after: afterCursor } = (await req.json()) as {
      configId: string;
      remaining?: number;
      after?: string;
    };


    // Regular client (respecting RLS) + admin client (bypass)
    const supabase = createServerSupabaseClient();
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Fetch scan config via admin (bypass RLS)
    const { data: config, error: cfgErr } = await supabaseAdmin
      .from('scan_configs')
      .select('*')
      .eq('id', configId)
      .single();
    // Ensure recurring inbox job exists for this user
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || '';
    if (baseUrl) {
      ensureInboxSchedule(config.user_id, baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`);
    }

    if (cfgErr || !config) {
      return NextResponse.json(
        { error: 'Config not found' },
        { status: 404 }
      );
    }

    // Ensure we have a userId (fallback to config owner for internal calls)
    if (!userId) {
      userId = config.user_id;
    }

    let remaining = remainingInput ?? MAX_TOTAL_POSTS;

    // ----- Quota enforcement (use denormalized message_count like /api/user/stats) -----
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('subscription_status, message_count')
      .eq('id', userId)
      .single();
    const planStatus = userRow?.subscription_status || 'free';
    const PLAN_LIMITS: Record<string, number | null> = { free: 15, pro: 200, advanced: null };
    const planLimit = Object.prototype.hasOwnProperty.call(PLAN_LIMITS, planStatus)
      ? PLAN_LIMITS[planStatus]
      : 15;
    let quotaRemaining: number | null = null;
    if (planLimit !== null) {
      const used = userRow?.message_count || 0;
      quotaRemaining = Math.max(0, planLimit - used);
      console.log('scan-start quota check', { userId, planStatus, planLimit, used, quotaRemaining });
      if (quotaRemaining === 0) {
        await supabaseAdmin.from('bot_logs').insert({
          user_id: userId,
          config_id: configId,
          action: 'quota_reached',
          status: 'error',
          subreddit: config.subreddit,
        });
        return NextResponse.json({ error: 'quota_reached' }, { status: 402 });
      }
      // Adjust remaining posts based on quota
      remaining = Math.min(remaining, quotaRemaining);
    }


    // If bot stopped, abort processing
    if (config.is_active === false) {
      return NextResponse.json({ skipped: true, reason: 'config_inactive' });
    }

    // --- Enforce runtime limit based on scan_interval ---
    const MIN_INTERVAL_MIN = 10;
    const MAX_INTERVAL_MIN = 300; // 5 hours
    const effectiveInterval = Math.max(
      MIN_INTERVAL_MIN,
      Math.min(config.scan_interval ?? MIN_INTERVAL_MIN, MAX_INTERVAL_MIN)
    );

    // Fetch the timestamp when this bot was first started (from earliest start_bot log)
    const { data: firstStart } = await supabaseAdmin
      .from('bot_logs')
      .select('created_at')
      .eq('config_id', configId)
      .eq('action', 'start_bot')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (firstStart) {
      const elapsedMinutes =
        (Date.now() - new Date(firstStart.created_at).getTime()) / 60000;
      if (elapsedMinutes >= effectiveInterval) {
        // Deactivate bot
        await supabaseAdmin
          .from('scan_configs')
          .update({ is_active: false })
          .eq('id', configId);

        await supabaseAdmin.from('bot_logs').insert({
          user_id: userId,
          config_id: configId,
          action: 'stop_bot',
          status: 'success',
          subreddit: config.subreddit,
          message: `Runtime limit of ${effectiveInterval} minutes reached`,
        });

        return NextResponse.json({ stopped: true, reason: 'interval_reached' });
      }
    }


    // Log start_bot action (only on first invocation)
    if (!afterCursor) {
      await supabaseAdmin.from('bot_logs').insert({
        user_id: userId,
        config_id: configId,
        action: 'start_bot',
        status: 'success',
        subreddit: config.subreddit,
      });

      // Schedule an automatic stop after the configured scan_interval (clamped)
      try {
        let rawBase = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '';
        if (!rawBase) rawBase = new URL(req.url).host;
        const normalizedBase = rawBase.startsWith('http://') || rawBase.startsWith('https://')
          ? rawBase.replace(/\/$/, '')
          : `https://${rawBase.replace(/\/$/, '')}`;

        await scheduleQStashMessage({
          destination: `${normalizedBase}/api/reddit/stop-bot`,
          body: { configId },
          delaySeconds: effectiveInterval * 60, // seconds
          headers: { 'X-Internal-API': 'true' },
        });
      } catch (e) {
        console.error('Failed to schedule auto stop-bot message', e);
      }
    }

    // Log start_scan action
    await supabaseAdmin.from('bot_logs').insert({
      user_id: userId,
      config_id: configId,
      action: 'start_scan',
      status: 'info',
      subreddit: config.subreddit,
      message: `Scan started; remaining ${remaining}, after ${afterCursor || 'none'}`,
    });

    // Run auto-archive check on every invocation so we don’t wait for final batch
    await checkAndArchiveLogs(
      supabaseAdmin,
      userId as string,
      configId,
      config.subreddit
    );

    // Fetch Reddit account creds
    const { data: account } = await supabaseAdmin
      .from('reddit_accounts')
      .select('*')
      .eq('id', config.reddit_account_id)
      .single();
    if (!account) {
      return NextResponse.json(
        { error: 'Reddit account not found' },
        { status: 400 }
      );
    }

    // Minimal snoowrap instance
    const reddit = new snoowrap({
      userAgent: 'Reddit Bot SaaS',
      clientId: account.client_id,
      clientSecret: account.client_secret,
      username: account.username,
      password: account.password,
    });

    // ----- Reddit auth + fetch with detailed logs -----
    await supabaseAdmin.from('bot_logs').insert({
      user_id: userId,
      config_id: configId,
      action: 'reddit_auth_attempt',
      status: 'info',
      subreddit: config.subreddit,
    });

    let rawPosts: any[] = [];
    try {
      // Log API request
      await supabaseAdmin.from('bot_logs').insert({
        user_id: userId,
        config_id: configId,
        action: 'reddit_api_request',
        status: 'info',
        subreddit: config.subreddit,
        message: 'getNew posts',
      });

      rawPosts = await reddit
        .getSubreddit(config.subreddit)
        .getNew({ limit: MAX_TOTAL_POSTS, after: afterCursor });

      await supabaseAdmin.from('bot_logs').insert([
        {
          user_id: userId,
          config_id: configId,
          action: 'reddit_api_success',
          status: 'success',
          subreddit: config.subreddit,
        },
        {
          user_id: userId,
          config_id: configId,
          action: 'reddit_auth_success',
          status: 'success',
          subreddit: config.subreddit,
        },
      ]);
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin.from('bot_logs').insert([
        {
          user_id: userId,
          config_id: configId,
          action: 'reddit_api_error',
          status: 'error',
          subreddit: config.subreddit,
          error_message: errMsg,
        },
        {
          user_id: userId,
          config_id: configId,
          action: 'reddit_auth_error',
          status: 'error',
          subreddit: config.subreddit,
          error_message: errMsg,
        },
      ]);
      throw err;
    }

    // Determine which posts need a message (keyword match & not already messaged)
    const candidatePosts: any[] = [];
    const seenAuthors = new Set<string>();
    const keywords = (config.keywords || []) as string[];
    let scheduledCount = 0;

    for (const post of rawPosts) {
      const titleLower = (post.title || '').toLowerCase();
      if (!keywords.some((kw) => titleLower.includes(kw.toLowerCase()))) continue;

      // Skip if we have already queued a message for this author in this batch
      if (seenAuthors.has(post.author.name)) continue;

      const { data: existingMsg } = await supabaseAdmin
        .from('sent_messages')
        .select('id')
        .eq('user_id', userId)
        .eq('account_id', config.reddit_account_id)
        .eq('post_id', post.id)
        .maybeSingle();
      if (existingMsg) continue; // already messaged historically

      candidatePosts.push(post);
      seenAuthors.add(post.author.name);
    }

    if (candidatePosts.length === 0) {
      return NextResponse.json({ queued: false, reason: 'No new posts' });
    }
    //pous test

    // Publish one message per post with increasing delay
    // Determine base host for consumer endpoint (should not include protocol)
    let rawBase = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '';
    // Fallback to request host if env vars are missing (e.g., preview deployments)
    if (!rawBase) {
      rawBase = new URL(req.url).host; // host comes without protocol
    }
    // If the env var already contains a protocol, keep it; otherwise prepend https://
    const normalizedBase = rawBase.startsWith('http://') || rawBase.startsWith('https://')
      ? rawBase.replace(/\/$/, '')
      : `https://${rawBase.replace(/\/$/, '')}`;

    if (!normalizedBase || !/^https?:\/\//.test(normalizedBase)) {
      throw new Error('Invalid or missing NEXT_PUBLIC_APP_URL / VERCEL_URL env var');
    }
    const consumerUrl = `${normalizedBase}/api/reddit/scan-post`;

    const SPACING_SECONDS = 160; // 2 min 40 s between messages
    const nowSec = Math.floor(Date.now() / 1000);
    let i = 0;
    for (const post of candidatePosts) {
      if (scheduledCount >= BATCH_SIZE || scheduledCount >= remaining) break;
      const notBefore = nowSec + i * SPACING_SECONDS;
      await scheduleQStashMessage({
        destination: consumerUrl,
        body: { configId, postId: post.id },
        notBefore,
        headers: {
          'X-Internal-API': 'true',
        },
      });
      scheduledCount += 1;
      i += 1;
    }

    const newRemaining = remaining - scheduledCount;

    // If more posts remain, schedule the next scan-start job after the last scheduled item + buffer
    if (newRemaining > 0) {
      const nextNotBefore = nowSec + i * SPACING_SECONDS + 10; // 10-second buffer
      await scheduleQStashMessage({
        destination: `${normalizedBase}/api/reddit/scan-start`,
        body: {
          configId,
          remaining: newRemaining,
          after: rawPosts[rawPosts.length - 1]?.name,
        },
        notBefore: nextNotBefore,
        headers: {
          'X-Internal-API': 'true',
        },
      });
    } else {
      // All required posts processed in this run – mark completion
      await supabaseAdmin.from('bot_logs').insert({
        user_id: userId,
        config_id: configId,
        action: 'scan_complete',
        status: 'success',
        subreddit: config.subreddit,
        message: `Processed ${scheduledCount} posts`,
      });

      // Archive all logs at the end of a scan cycle (keep start_bot & scan_complete)
      await checkAndArchiveLogs(
        supabaseAdmin,
        userId as string,
        configId,
        config.subreddit,
        true // archiveAll
      );
    }

    return NextResponse.json({ queued: true, batch: scheduledCount, remaining: newRemaining });
  } catch (err) {
    console.error('scan-start error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
