import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { createClient } from '@supabase/supabase-js';
import snoowrap from 'snoowrap';
import { callGemini } from '../../../../utils/gemini';
import { scheduleQStashMessage } from '../../../../utils/qstash';

export const runtime = 'nodejs'; // we need node modules (snoowrap)

// Simple health check so QStash (or uptime monitors) can verify the endpoint without
// triggering signature verification. Returns 200 OK.
export async function GET() {
  return NextResponse.json({ ok: true });
}

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
    if (config.is_active === false) {
      console.log('scan-post: config inactive, skipping');
      // Respond with 410 Gone so QStash will stop retrying this specific message.
      const resGone = NextResponse.json(
        { skipped: true, reason: 'config_inactive' },
        { status: 410 }
      );
      // Explicitly mark as non-retryable according to Upstash docs.
      resGone.headers.set('Upstash-NonRetryable-Error', 'true');
      return resGone;
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

    // ----- Reddit auth + fetch with detailed logs -----
    await supabase.from('bot_logs').insert({
      user_id: config.user_id,
      config_id: configId,
      action: 'reddit_auth_attempt',
      status: 'info',
      subreddit: config.subreddit,
    });

    // Apply proxy for this request if configured
    const prevHttp = process.env.HTTP_PROXY;
    const prevHttps = process.env.HTTPS_PROXY;
    const prevNoProxy = process.env.NO_PROXY;
    try {
      if (account.proxy_enabled && account.proxy_host && account.proxy_port && account.proxy_type) {
        const auth = account.proxy_username
          ? `${encodeURIComponent(account.proxy_username)}${account.proxy_password ? ':' + encodeURIComponent(account.proxy_password) : ''}@`
          : '';
        const proxyUrl = `${account.proxy_type}://${auth}${account.proxy_host}:${account.proxy_port}`;
        process.env.HTTP_PROXY = proxyUrl;
        process.env.HTTPS_PROXY = proxyUrl;
        if (process.env.NO_PROXY !== undefined) delete process.env.NO_PROXY;
        const safeProxy = `${account.proxy_type}://${account.proxy_host}:${account.proxy_port}`;
        console.log('scan-post: proxy_enabled', safeProxy);
        await supabase.from('bot_logs').insert({
          user_id: config.user_id,
          config_id: configId,
          action: 'proxy_enabled_for_request',
          status: 'info',
          subreddit: config.subreddit,
          message: `${account.proxy_type}://${account.proxy_host}:${account.proxy_port}`,
        });
      } else {
        delete process.env.HTTP_PROXY;
        delete process.env.HTTPS_PROXY;
        process.env.NO_PROXY = '*';
        console.log('scan-post: proxy_disabled');
      }

      const reddit = new snoowrap({
        userAgent: 'Reddit Bot SaaS',
        clientId: account.client_id,
        clientSecret: account.client_secret,
        username: account.username,
        password: account.password,
      });

      let post: any;
      try {
        await supabase.from('bot_logs').insert({
          user_id: config.user_id,
          config_id: configId,
          action: 'reddit_api_request',
          status: 'info',
          subreddit: config.subreddit,
          post_id: postId,
          message: 'fetchSubmission',
        });

        post = await (reddit.getSubmission(postId) as any).fetch();

        await supabase.from('bot_logs').insert([
          {
            user_id: config.user_id,
            config_id: configId,
            action: 'reddit_api_success',
            status: 'success',
            subreddit: config.subreddit,
            post_id: postId,
          },
          {
            user_id: config.user_id,
            config_id: configId,
            action: 'reddit_auth_success',
            status: 'success',
            subreddit: config.subreddit,
          },
        ]);
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await supabase.from('bot_logs').insert([
          {
            user_id: config.user_id,
            config_id: configId,
            action: 'reddit_api_error',
            status: 'error',
            subreddit: config.subreddit,
            post_id: postId,
            error_message: errMsg,
          },
          {
            user_id: config.user_id,
            config_id: configId,
            action: 'reddit_auth_error',
            status: 'error',
            subreddit: config.subreddit,
            error_message: errMsg,
          },
        ]);
        throw err;
      }

      // AI analysis with detailed logging
      let geminiResult: any = null;
      let isRelevant = false;
      try {
        // Prepare keywords array from config (string or array in DB)
        let keywordsArr: string[] = [];
        if (typeof config.keywords === 'string') {
          keywordsArr = config.keywords
            .split(',')
            .map((k: string) => k.trim())
            .filter(Boolean);
        } else if (Array.isArray(config.keywords)) {
          keywordsArr = (config.keywords as any[]).map((k) => String(k).trim());
        }

        geminiResult = await callGemini(post.title + '\n' + post.selftext, {
          subreddit: config.subreddit,
          keywords: keywordsArr,
        });

        // Log successful analysis
        await supabase.from('bot_logs').insert([
          {
            user_id: config.user_id,
            config_id: configId,
            action: 'ai_analysis_success',
            status: 'info',
            subreddit: config.subreddit,
            post_id: postId,
            analysis_data: JSON.stringify(geminiResult),
          },
          {
            user_id: config.user_id,
            config_id: configId,
            action: 'ai_analysis',
            status: geminiResult?.isRelevant ? 'success' : 'info',
            subreddit: config.subreddit,
            post_id: postId,
            analysis_data: JSON.stringify(geminiResult),
          },
        ]);

        isRelevant = geminiResult?.isRelevant ?? false;

        console.log('scan-post: analysis result', {
          postId,
          isRelevant,
          confidence: geminiResult?.confidence,
        });
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await supabase.from('bot_logs').insert({
          user_id: config.user_id,
          config_id: configId,
          action: 'ai_analysis_error',
          status: 'warning',
          subreddit: config.subreddit,
          post_id: postId,
          error_message: errMsg,
        });
        console.error('scan-post: AI analysis error', errMsg);
        // leave isRelevant = false to treat post as not relevant
      }

      if (!isRelevant) {
        await supabase.from('bot_logs').insert({
          user_id: config.user_id,
          config_id: configId,
          action: 'post_irrelevant',
          status: 'skip',
          subreddit: config.subreddit,
          post_id: postId,
          recipient: post.author.name,
          message: 'Post deemed not relevant by AI',
        });
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
        await supabase.from('bot_logs').insert({
          user_id: config.user_id,
          config_id: configId,
          action: 'already_messaged_post',
          status: 'skip',
          subreddit: config.subreddit,
          post_id: postId,
          recipient: post.author.name,
        });
        return NextResponse.json({ skipped: true, reason: 'already_messaged_post' });
      }
      if (previousMessages && previousMessages.length > 0) {
        console.log('scan-post: already messaged user via this config', post.author.name);
        await supabase.from('bot_logs').insert({
          user_id: config.user_id,
          config_id: configId,
          action: 'already_messaged_config',
          status: 'skip',
          subreddit: config.subreddit,
          post_id: postId,
          recipient: post.author.name,
        });
        return NextResponse.json({ skipped: true, reason: 'already_messaged_config' });
      }

      // ----- Quota enforcement (per message using message_count) -----
      const PLAN_LIMITS: Record<string, number | null> = { free: 15, pro: 200, advanced: null };
      const { data: userRow } = await supabase
        .from('users')
        .select('subscription_status, message_count')
        .eq('id', config.user_id)
        .single();
      const planStatus = userRow?.subscription_status || 'free';
      const planLimit = Object.prototype.hasOwnProperty.call(PLAN_LIMITS, planStatus)
        ? PLAN_LIMITS[planStatus]
        : 15;
      if (planLimit !== null) {
        const used = userRow?.message_count || 0;
        const remainingQuota = Math.max(0, planLimit - used);
        console.log('scan-post quota check', { userId: config.user_id, planStatus, planLimit, used, remainingQuota });
        if (remainingQuota === 0) {
          // Deactivate bot when quota reached
          await supabase.from('scan_configs').update({ is_active: false }).eq('id', configId);
          await supabase.from('bot_logs').insert({
            user_id: config.user_id,
            config_id: configId,
            action: 'bot_stopped_quota',
            status: 'warning',
            subreddit: config.subreddit,
            message: 'Bot automatically stopped due to quota reached',
          });
          await supabase.from('bot_logs').insert({
            user_id: config.user_id,
            config_id: configId,
            action: 'quota_reached',
            status: 'error',
            subreddit: config.subreddit,
            post_id: postId,
          });
          return NextResponse.json({ skipped: true, reason: 'quota_reached' });
        }
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
        ]);

      if ((reservation as any)?.error) {
        console.error('scan-post: reservation insert error', (reservation as any).error);
      }

      // Build message content based on template

      const messageContent = contentRaw
        .replace(/\{username\}/g, post.author.name)
        .replace(/\{subreddit\}/g, config.subreddit)
        .replace(/\{post_title\}/g, post.title);

      // ----- Queue send via QStash schedule with staggered delay using atomic counter -----
      const BASE_DELAY_SEC = 200; // 3m20s
      const windowStart = new Date(Math.floor(Date.now() / (60 * 60 * 1000)) * 60 * 60 * 1000); // start of current hour

      // Call atomic increment function
      let index = 1;
      try {
        const { data: inc, error: incErr } = await supabase.rpc('increment_message_counter', {
          p_user_id: config.user_id,
          p_window_start: windowStart.toISOString(),
        });
        if (incErr) throw incErr;
        index = (inc as number) || 1;
      } catch (e: any) {
        console.error('scan-post: increment_message_counter error, falling back to 1', e?.message || e);
        index = 1;
      }
      const delaySeconds = Math.max(1, BASE_DELAY_SEC * (index - 1)); // Ensure minimum 1 second delay

      // Log schedule after we know delay
      await supabase.from('bot_logs').insert([
        {
          user_id: config.user_id,
          config_id: configId,
          action: 'message_scheduled',
          status: 'queue',
          subreddit: config.subreddit,
          post_id: postId,
          recipient: post.author.name,
          message: `Atomic queue index ${index}, delay ~${delaySeconds}s`,
        }
      ]);

      console.log('scan-post: scheduling send-message via QStash', { delaySeconds });

      // Build absolute destination URL for QStash
      const origin =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        `https://${process.env.VERCEL_URL}`;
      const destinationUrl = `${origin.replace(/\/$/, '')}/api/reddit/send-message`;

      await scheduleQStashMessage({
        destination: destinationUrl,
        body: {
          userId: config.user_id,
          recipientUsername: post.author.name,
          accountId: config.reddit_account_id,
          message: messageContent,
          subject: `Regarding your post in r/${config.subreddit}`,
          postId,
          configId,
        },
        delaySeconds,
        headers: {
          'Upstash-Forward-X-Internal-API': 'true',
          'Upstash-Schedule-Id': `msg-${configId}-${postId}`,
        },
      });

      return NextResponse.json({ queued: true, delaySeconds });
    } finally {
      process.env.HTTP_PROXY = prevHttp;
      process.env.HTTPS_PROXY = prevHttps;
      if (prevNoProxy !== undefined) process.env.NO_PROXY = prevNoProxy; else delete process.env.NO_PROXY;
      console.log('scan-post: proxy_envs_restored');
    }
  } catch (err) {
    console.error('scan-post error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
});
