import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import snoowrap from 'snoowrap';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      accountId?: string;
      proxy?: {
        enabled?: boolean;
        type?: 'http' | 'https' | 'socks5';
        host?: string;
        port?: number;
        username?: string;
        password?: string;
      };
      credentials?: {
        username: string;
        password: string;
        clientId: string;
        clientSecret: string;
      };
    };

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Gate by plan
    const { data: userRow } = await supabase
      .from('users')
      .select('subscription_status')
      .eq('id', userId)
      .maybeSingle();
    const plan = userRow?.subscription_status || 'free';
    if (plan === 'free' || plan === 'trialing') {
      return NextResponse.json({ error: 'Proxy testing is available on paid plans only.' }, { status: 403 });
    }

    // Load account if provided
    let account: any | null = null;
    if (body.accountId) {
      const { data } = await supabase
        .from('reddit_accounts')
        .select('*')
        .eq('id', body.accountId)
        .eq('user_id', userId)
        .maybeSingle();
      account = data || null;
    }

    // Determine credentials for test
    const creds = body.credentials || (account
      ? {
          username: account.username,
          password: account.password,
          clientId: account.client_id,
          clientSecret: account.client_secret,
        }
      : null);
    if (!creds) {
      return NextResponse.json({ error: 'Missing credentials for proxy test' }, { status: 400 });
    }

    // Determine proxy configuration (override wins)
    const effectiveProxy = body.proxy || (account
      ? {
          enabled: !!account.proxy_enabled,
          type: account.proxy_type as 'http' | 'https' | 'socks5' | undefined,
          host: account.proxy_host as string | undefined,
          port: account.proxy_port as number | undefined,
          username: account.proxy_username as string | undefined,
          password: account.proxy_password as string | undefined,
        }
      : undefined);

    if (!effectiveProxy?.enabled) {
      return NextResponse.json({ error: 'Proxy is not enabled in the provided settings.' }, { status: 400 });
    }
    if (!effectiveProxy.type || !effectiveProxy.host || !effectiveProxy.port) {
      return NextResponse.json({ error: 'Incomplete proxy settings' }, { status: 400 });
    }

    const authPart = effectiveProxy.username
      ? `${encodeURIComponent(effectiveProxy.username)}${effectiveProxy.password ? ':' + encodeURIComponent(effectiveProxy.password) : ''}@`
      : '';
    const proxyUrl = `${effectiveProxy.type}://${authPart}${effectiveProxy.host}:${effectiveProxy.port}`;

    const prevHttp = process.env.HTTP_PROXY;
    const prevHttps = process.env.HTTPS_PROXY;
    const started = Date.now();
    try {
      process.env.HTTP_PROXY = proxyUrl;
      process.env.HTTPS_PROXY = proxyUrl;

      // Test Reddit via snoowrap
      const reddit = new snoowrap({
        userAgent: 'Reddit Bot SaaS - proxy test',
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        username: creds.username,
        password: creds.password,
      });
      // Use any call; getMe is simple
      await (reddit as any).getMe();

      const latencyMs = Date.now() - started;

      // Update account status if we had an accountId
      if (account?.id) {
        await supabase
          .from('reddit_accounts')
          .update({ proxy_status: 'ok', proxy_last_checked: new Date().toISOString() })
          .eq('id', account.id);
      }

      await supabase.from('bot_logs').insert({
        user_id: userId,
        action: 'proxy_test_success',
        status: 'info',
        subreddit: '_system',
        message: `${effectiveProxy.type}://${effectiveProxy.host}:${effectiveProxy.port} • ${latencyMs}ms`,
      });

      // Optionally try ipify to return observed IP (best-effort)
      let ip: string | null = null;
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json', { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (ipRes.ok) {
          const j = await ipRes.json();
          ip = j?.ip || null;
        }
      } catch {}

      return NextResponse.json({ ok: true, latencyMs, ip, proxy: { url: `${effectiveProxy.type}://${effectiveProxy.host}:${effectiveProxy.port}` } });
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      if (account?.id) {
        await supabase
          .from('reddit_accounts')
          .update({ proxy_status: 'error', proxy_last_checked: new Date().toISOString() })
          .eq('id', account.id);
      }
      await supabase.from('bot_logs').insert({
        user_id: userId,
        action: 'proxy_test_error',
        status: 'error',
        subreddit: '_system',
        error_message: msg.slice(0, 250),
      });
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    } finally {
      process.env.HTTP_PROXY = prevHttp;
      process.env.HTTPS_PROXY = prevHttps;
    }
  } catch (err) {
    console.error('proxy/test error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 