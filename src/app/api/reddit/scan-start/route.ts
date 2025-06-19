import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerSupabaseClient } from '../../../../utils/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { publishQStashMessage, scheduleQStashMessage } from '../../../../utils/qstash';
import snoowrap from 'snoowrap';

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
    const remaining = remainingInput ?? MAX_TOTAL_POSTS;
    if (!configId) {
      return NextResponse.json(
        { error: 'configId is required' },
        { status: 400 }
      );
    }

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
    // If bot stopped, abort processing
    if (config.is_active === false) {
      return NextResponse.json({ skipped: true, reason: 'config_inactive' });
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
    }

    return NextResponse.json({ queued: true, batch: scheduledCount, remaining: newRemaining });
  } catch (err) {
    console.error('scan-start error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
