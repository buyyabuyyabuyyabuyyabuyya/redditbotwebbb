import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerSupabaseClient } from '../../../../utils/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { publishQStashMessage } from '../../../../utils/qstash';
import snoowrap from 'snoowrap';

// Inter-message delay (ms)
const DELAY_INTERVAL_MS = 100_000; // 100 s ≈ 1.7 min – safe for Reddit
const MAX_POSTS = 10; // process at most N posts per scan-start to stay fast

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { configId } = await req.json();
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

    // Fetch latest posts (subreddit new, limit MAX_POSTS)
    const rawPosts = await reddit.getSubreddit(config.subreddit).getNew({ limit: MAX_POSTS });

    // Determine which posts need a message (keyword match & not already messaged)
    const candidatePosts = [] as any[];
    const keywords = (config.keywords || []) as string[];

    for (const post of rawPosts) {
      const titleLower = (post.title || '').toLowerCase();
      if (!keywords.some((kw) => titleLower.includes(kw.toLowerCase()))) continue;

      const { data: existingMsg } = await supabaseAdmin
        .from('sent_messages')
        .select('id')
        .eq('user_id', userId)
        .eq('config_id', configId)
        .eq('post_id', post.id)
        .maybeSingle();
      if (existingMsg) continue; // already messaged
      candidatePosts.push(post);
    }

    if (candidatePosts.length === 0) {
      return NextResponse.json({ queued: false, reason: 'No new posts' });
    }

    // Publish one message per post with increasing delay
    // Determine base host for consumer endpoint (should not include protocol)
    const rawBase = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '';
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
      const delayMs = i * DELAY_INTERVAL_MS;
      await publishQStashMessage({
        destination: consumerUrl,
        body: { configId, postId: post.id },
        delayMs,
      });
      i += 1;
    }

    return NextResponse.json({ queued: true, count: candidatePosts.length });
  } catch (err) {
    console.error('scan-start error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
