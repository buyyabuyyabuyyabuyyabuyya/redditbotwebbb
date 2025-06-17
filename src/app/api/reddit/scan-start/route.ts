import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerSupabaseClient } from '../../../../utils/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { publishQStashMessage } from '../../../../utils/qstash';
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
    const { userId } = auth();
    if (!internal && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { configId, remaining: remainingInput } = (await req.json()) as {
      configId: string;
      remaining?: number;
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

    // Fetch latest posts (subreddit new, limit up to MAX_TOTAL_POSTS so we have enough)
    const rawPosts = await reddit
      .getSubreddit(config.subreddit)
      .getNew({ limit: MAX_TOTAL_POSTS });

    // Determine which posts need a message (keyword match & not already messaged)
    const candidatePosts = [] as any[];
    const keywords = (config.keywords || []) as string[];
    let scheduledCount = 0;

    for (const post of rawPosts) {
      const titleLower = (post.title || '').toLowerCase();
      if (!keywords.some((kw) => titleLower.includes(kw.toLowerCase()))) continue;

      const { data: existingMsg } = await supabaseAdmin
        .from('sent_messages')
        .select('id')
        .eq('user_id', userId)
        .eq('reddit_account_id', config.reddit_account_id)
        .eq('recipient_username', post.author.name)
        .maybeSingle();
      if (existingMsg) continue; // already messaged
      candidatePosts.push(post);
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

    let i = 0;
    for (const post of candidatePosts) {
      if (scheduledCount >= BATCH_SIZE || scheduledCount >= remaining) break;
      const delayMs = i * DELAY_INTERVAL_MS;
      await publishQStashMessage({
        destination: consumerUrl,
        body: { configId, postId: post.id },
        delayMs,
        headers: {
          'X-Internal-API': 'true',
        },
      });
      scheduledCount += 1;
      i += 1;
    }

    const newRemaining = remaining - scheduledCount;

    // If we still have more to process, queue another batch of scan-start after the last message + small buffer
    if (newRemaining > 0) {
      const nextDelayMs = i * DELAY_INTERVAL_MS + 5_000; // buffer 5 s
      await publishQStashMessage({
        destination: `${normalizedBase}/api/reddit/scan-start`,
        body: { configId, remaining: newRemaining },
        delayMs: nextDelayMs,
        headers: {
          'X-Internal-API': 'true',
        },
      });
    } else {
      // Mark finished in bot_logs
      await supabaseAdmin.from('bot_logs').insert({
        user_id: userId,
        config_id: configId,
        action: 'finished_scan',
        message: `Processed ${MAX_TOTAL_POSTS} posts`,
      });
    }

    return NextResponse.json({ queued: true, batch: scheduledCount, remaining: newRemaining });
  } catch (err) {
    console.error('scan-start error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
