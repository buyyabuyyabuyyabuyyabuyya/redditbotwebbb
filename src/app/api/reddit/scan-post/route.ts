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

    if (!isRelevant) {
      return NextResponse.json({ skipped: true });
    }

    // Build message content
    const { data: template } = await supabase
      .from('message_templates')
      .select('*')
      .eq('id', config.message_template_id)
      .single();

    const contentRaw = template?.content || 'Hello {username}!';
    const messageContent = contentRaw
      .replace(/\{username\}/g, post.author.name)
      .replace(/\{subreddit\}/g, config.subreddit)
      .replace(/\{post_title\}/g, post.title);

    // Call Edge Function to send message (no extra delay)
    // Call our internal proxy route so Vercel logs the request
    let rawBase = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '';
    if (!rawBase) {
      rawBase = new URL(req.url).host;
    }
    const normalizedBase = rawBase.startsWith('http://') || rawBase.startsWith('https://')
      ? rawBase.replace(/\/$/, '')
      : `https://${rawBase.replace(/\/$/, '')}`;
    const funcUrl = `${normalizedBase}/api/reddit/send-message`;

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
      }),
    });

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
