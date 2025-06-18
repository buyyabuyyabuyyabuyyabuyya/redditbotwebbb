import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { createClient } from '@supabase/supabase-js';
import snoowrap from 'snoowrap';
import { callGemini } from '../../../../utils/gemini';

export const runtime = 'nodejs'; // we need node modules (snoowrap)

export const POST = verifySignatureAppRouter(async (req: Request) => {
  try {
    const payload = (await req.json()) as { configId: string; postId: string };
    const { configId, postId } = payload;
    if (!configId || !postId) {
      return NextResponse.json(
        { error: 'Missing configId or postId' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Pull config, account, template
    const { data: config } = await supabase
      .from('scan_configs')
      .select('*')
      .eq('id', configId)
      .single();
    if (!config) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    const { data: account } = await supabase
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

    // Fetch post via Reddit API
    const reddit = new snoowrap({
      userAgent: 'Reddit Bot SaaS',
      clientId: account.client_id,
      clientSecret: account.client_secret,
      username: account.username,
      password: account.password,
    });
    const post = await reddit.getSubmission(postId).fetch();

    // AI analysis
    const geminiResult = await callGemini(post.title + '\n' + post.selftext);
    const isRelevant = geminiResult?.isRelevant ?? false;

    console.log('scan-post: analysis result', {
      postId,
      isRelevant,
      confidence: geminiResult?.confidence,
    });

    if (!isRelevant) {
      return NextResponse.json({ skipped: true });
    }

    // Enhanced duplicate checks (post-specific & config-level)
    // 1️⃣ Has this exact post already been messaged?
    const { data: existingMessage } = await supabase
      .from('sent_messages')
      .select('id')
      .eq('user_id', config.user_id)
      .eq('account_id', config.reddit_account_id)
      .eq('recipient', post.author.name)
      .eq('post_id', postId)
      .maybeSingle();

    // 2️⃣ Has this user been messaged by this config before (different post)?
    const { data: previousMessages } = await supabase
      .from('sent_messages')
      .select('id')
      .eq('user_id', config.user_id)
      .eq('recipient', post.author.name)
      .eq('config_id', configId)
      .limit(1);

    if (existingMessage) {
      console.log('scan-post: already messaged user about this post', post.author.name);
      return NextResponse.json({ skipped: true, reason: 'already_messaged_post' });
    }
    if (previousMessages && previousMessages.length > 0) {
      console.log('scan-post: already messaged user via this config', post.author.name);
      return NextResponse.json({ skipped: true, reason: 'already_messaged_config' });
    }

    // Fetch template first (needed for reservation)
    const { data: template } = await supabase
      .from('message_templates')
      .select('content')
      .eq('id', config.message_template_id)
      .single();

    const contentRaw = template?.content || 'Hello {username}!';

    // Reserve a row immediately so concurrent scans skip this user
    const reservation = await supabase
      .from('sent_messages')
      .insert([
        {
          user_id: config.user_id,
          account_id: config.reddit_account_id,
          recipient: post.author.name,
          post_id: postId,
          config_id: configId,
          subreddit: config.subreddit,
          message_template: contentRaw, // non-null
          sent_at: new Date().toISOString(),
        },
      ], { ignoreDuplicates: true });

    if (reservation.error) {
      console.error('scan-post: reservation insert error', reservation.error);
    }

    // Build message content based on template

    const messageContent = contentRaw
      .replace(/\{username\}/g, post.author.name)
      .replace(/\{subreddit\}/g, config.subreddit)
      .replace(/\{post_title\}/g, post.title);

    // Call Edge Function to send message (no extra delay)
    // Call our internal proxy route so Vercel logs the request
    // Prefer same-origin relative URL to avoid DNS lookup / egress if we are already inside the Vercel deployment
    let funcUrl = '/api/reddit/send-message';
    // Fallback to absolute URL for local dev or edge cases where relative won’t work (e.g. invoked from Edge Function)
    if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL) {
      funcUrl = `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/reddit/send-message`;
    }

    const EDGE_DELAY_MS = 5_000; // 5-second buffer after AI check

    console.log('scan-post: calling send-message', funcUrl);
    const edgeRes = await fetch(funcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        'X-Internal-API': 'true',
      },
      body: JSON.stringify({
        userId: config.user_id,
        recipientUsername: post.author.name,
        accountId: config.reddit_account_id,
        message: messageContent,
        subject: `Regarding your post in r/${config.subreddit}`,
        delayMs: EDGE_DELAY_MS,
        postId,
        configId,
      }),
    });

    console.log('scan-post: send-message status', edgeRes.status);
    if (!edgeRes.ok) {
      const errText = await edgeRes.text();
      console.error('send-message edge function failed', edgeRes.status, errText);
      return NextResponse.json(
        { error: 'Message send failed', details: errText },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('scan-post error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
});
