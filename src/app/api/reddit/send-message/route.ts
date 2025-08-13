import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs'
import { createClient } from '@supabase/supabase-js'
import snoowrap from 'snoowrap'

export async function POST(req: Request) {
  try {
    const internal = req.headers.get('X-Internal-API') === 'true';
    const { userId } = auth();

    if (!internal && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      userId?: string;
      recipientUsername: string;
      accountId: string;
      message: string;
      subject?: string;
      configId?: string;
      postId?: string;
    };

    if (!internal) body.userId = userId!;

    const { recipientUsername, accountId, message, configId, postId } = body;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Fetch subreddit for nicer log (optional)
    let subreddit: string | null = null;
    if (configId) {
      const { data: cfg } = await supabaseAdmin
        .from('scan_configs')
        .select('subreddit')
        .eq('id', configId)
        .maybeSingle();
      subreddit = cfg?.subreddit || null;
    }

    await supabaseAdmin.from('bot_logs').insert({
      user_id: body.userId || userId,
      config_id: configId,
      action: 'message_send_attempt',
      status: 'info',
      subreddit,
      recipient: recipientUsername,
    });

    if (!recipientUsername || !accountId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Quota gate
    const PLAN_LIMITS: Record<string, number | null> = { free: 15, pro: 200, advanced: null };
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('subscription_status, message_count')
      .eq('id', body.userId || userId)
      .single();
    const planStatus = userRow?.subscription_status || 'free';
    const planLimit = Object.prototype.hasOwnProperty.call(PLAN_LIMITS, planStatus) ? PLAN_LIMITS[planStatus] : 15;
    if (planLimit !== null) {
      const used = userRow?.message_count || 0;
      if (used >= planLimit) {
        if (configId) {
          await supabaseAdmin.from('scan_configs').update({ is_active: false }).eq('id', configId);
          await supabaseAdmin.from('bot_logs').insert({
            user_id: body.userId || userId,
            config_id: configId,
            action: 'bot_stopped_quota',
            status: 'warning',
            subreddit,
            message: 'Bot automatically stopped due to quota reached',
          });
        }
        await supabaseAdmin.from('bot_logs').insert({
          user_id: body.userId || userId,
          config_id: configId,
          action: 'quota_reached',
          status: 'error',
          subreddit,
          recipient: recipientUsername,
        });
        return NextResponse.json({ error: 'quota_reached' }, { status: 402 });
      }
    }

    // Load account with proxy settings
    const { data: account } = await supabaseAdmin
      .from('reddit_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', body.userId || userId)
      .single();
    if (!account) {
      return NextResponse.json({ error: 'Reddit account not found' }, { status: 404 });
    }

    // Apply per-request proxy via env vars (scoped)
    const prevHttp = process.env.HTTP_PROXY;
    const prevHttps = process.env.HTTPS_PROXY;
    const prevNoProxy = process.env.NO_PROXY;
    try {
      if (account.proxy_enabled && account.proxy_host && account.proxy_port && account.proxy_type) {
        const auth = account.proxy_username
          ? `${encodeURIComponent(account.proxy_username)}${account.proxy_password ? ':' + encodeURIComponent(account.proxy_password) : ''}@`
          : '';
        const proxyUrl = `${account.proxy_type}://${auth}${account.proxy_host}:${account.proxy_port}`;
        
        // For HTTP/HTTPS proxies, set environment variables
        if (account.proxy_type === 'http' || account.proxy_type === 'https') {
          process.env.HTTP_PROXY = proxyUrl;
          process.env.HTTPS_PROXY = proxyUrl;
          // Allow HTTP proxy for HTTPS requests
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        }
        // For SOCKS5, use different env vars
        else if (account.proxy_type === 'socks5') {
          process.env.HTTP_PROXY = proxyUrl;
          process.env.HTTPS_PROXY = proxyUrl;
        }
        
        if (process.env.NO_PROXY !== undefined) delete process.env.NO_PROXY;
        console.log('send-message: proxy_enabled', `${account.proxy_type}://${account.proxy_host}:${account.proxy_port}`);
        await supabaseAdmin.from('bot_logs').insert({
          user_id: body.userId || userId,
          config_id: configId,
          action: 'proxy_enabled_for_request',
          status: 'info',
          subreddit,
          message: `${account.proxy_type}://${account.proxy_host}:${account.proxy_port}`,
        });
      } else {
        // Aggressively clear ALL proxy environment variables
        delete process.env.HTTP_PROXY;
        delete process.env.HTTPS_PROXY;
        delete process.env.http_proxy;
        delete process.env.https_proxy;
        delete process.env.ALL_PROXY;
        delete process.env.all_proxy;
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NO_PROXY = '*';
        process.env.no_proxy = '*';
        console.log('send-message: proxy_disabled');
      }

      const reddit = new snoowrap({
        userAgent: 'Reddit Bot SaaS',
        clientId: account.client_id,
        clientSecret: account.client_secret,
        username: account.username,
        password: account.password,
      });

      const OPT_OUT_FOOTER = '\n\n-----------------\nReply STOP to never hear from me again.';
      const finalText = message + OPT_OUT_FOOTER;

      // Send the message
      try {
        await reddit.composeMessage({
          to: recipientUsername,
          subject: body.subject || `Message from Reddit Bot SaaS`,
          text: finalText,
        } as any);
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        const privacyErr = msg.includes('NOT_WHITELISTED_BY_USER_MESSAGE') || msg.includes("can't send a message to that user");
        if (privacyErr) {
          await supabaseAdmin.from('bot_logs').insert({
            user_id: body.userId || userId,
            action: 'recipient_not_whitelisted',
            status: 'info',
            recipient: recipientUsername,
          });
          return NextResponse.json({ skipped: true, reason: 'recipient_not_whitelisted' });
        }
        await supabaseAdmin.from('bot_logs').insert({
          user_id: body.userId || userId,
          action: 'reddit_api_error',
          status: 'error',
          recipient: recipientUsername,
          error_message: msg.slice(0, 250),
        });
        return NextResponse.json({ error: 'reddit_send_failed' }, { status: 502 });
      }

      // Update counters and store record
      await supabaseAdmin
        .from('users')
        .update({ message_count: (userRow?.message_count ?? 0) + 1 })
        .eq('id', body.userId || userId);

      await supabaseAdmin.from('sent_messages').insert([
        {
          user_id: body.userId || userId,
          account_id: accountId,
          recipient: recipientUsername,
          content: message,
          post_id: postId ?? null,
          config_id: configId ?? null,
        },
      ]);

      await supabaseAdmin.from('bot_logs').insert({
        user_id: body.userId || userId,
        config_id: configId,
        action: 'message_sent',
        status: 'success',
        subreddit,
        recipient: recipientUsername,
      });

      return NextResponse.json({ success: true });
    } finally {
      // Restore envs
      process.env.HTTP_PROXY = prevHttp;
      process.env.HTTPS_PROXY = prevHttps;
      if (prevNoProxy !== undefined) process.env.NO_PROXY = prevNoProxy; else delete process.env.NO_PROXY;
      console.log('send-message: proxy_envs_restored');
    }
  } catch (err) {
    console.error('send-message error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
