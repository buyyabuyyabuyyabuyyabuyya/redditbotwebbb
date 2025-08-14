import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import snoowrap from 'snoowrap';
import { generateUserAgent, parseUserAgent, validateUserAgent } from '../../../../utils/userAgents';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userAgent, accountId } = body;

    let testUserAgent = userAgent;

    // If accountId is provided, get User Agent from database
    if (accountId) {
      const { data: account, error } = await supabaseAdmin
        .from('reddit_accounts')
        .select('user_agent_enabled, user_agent_type, user_agent_custom, client_id, client_secret, username, password, proxy_enabled, proxy_type, proxy_host, proxy_port, proxy_username, proxy_password')
        .eq('id', accountId)
        .eq('user_id', userId)
        .single();

      if (error || !account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      console.log('Account User Agent settings:', {
        enabled: account.user_agent_enabled,
        type: account.user_agent_type,
        custom: account.user_agent_custom
      });

      if (account.user_agent_enabled) {
        testUserAgent = generateUserAgent({
          enabled: account.user_agent_enabled,
          type: account.user_agent_type || 'default',
          custom: account.user_agent_custom || undefined
        });
      } else {
        testUserAgent = 'Reddit Bot SaaS'; // Default
      }

      console.log('Generated User Agent:', testUserAgent);

      // Test with actual Reddit API if we have account credentials
      if (account.client_id && account.client_secret && account.username && account.password) {
        // Apply proxy settings for testing (similar to other routes)
        const prevHttp = process.env.HTTP_PROXY;
        const prevHttps = process.env.HTTPS_PROXY;
        const prevNoProxy = process.env.NO_PROXY;

        try {
          if (account.proxy_enabled && account.proxy_host && account.proxy_port && account.proxy_type) {
            const auth = account.proxy_username
              ? `${encodeURIComponent(account.proxy_username)}${account.proxy_password ? ':' + encodeURIComponent(account.proxy_password) : ''}@`
              : '';
            const proxyUrl = `${account.proxy_type}://${auth}${account.proxy_host}:${account.proxy_port}`;

            if (account.proxy_type === 'http' || account.proxy_type === 'https') {
              process.env.HTTP_PROXY = proxyUrl;
              process.env.HTTPS_PROXY = proxyUrl;
              process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
            } else if (account.proxy_type === 'socks5') {
              process.env.HTTP_PROXY = proxyUrl;
              process.env.HTTPS_PROXY = proxyUrl;
            }

            if (process.env.NO_PROXY !== undefined) delete process.env.NO_PROXY;
            console.log('test-user-agent: proxy_enabled', `${account.proxy_type}://${account.proxy_host}:${account.proxy_port}`);
          } else {
            // Clear proxy settings
            delete process.env.HTTP_PROXY;
            delete process.env.HTTPS_PROXY;
            delete process.env.http_proxy;
            delete process.env.https_proxy;
            delete process.env.ALL_PROXY;
            delete process.env.all_proxy;
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
            process.env.NO_PROXY = '*';
            process.env.no_proxy = '*';
            console.log('test-user-agent: proxy_disabled');
          }

          const reddit = new snoowrap({
            userAgent: testUserAgent,
            clientId: account.client_id,
            clientSecret: account.client_secret,
            username: account.username,
            password: account.password,
          });

          // Try to get user info to test the User Agent
          // Use .then() directly to avoid TypeScript circular reference issues with snoowrap's thenable objects
          await new Promise<void>((resolve, reject) => {
            reddit.getMe().then(() => {
              console.log(`User Agent test successful`);
              resolve();
            }).catch(reject);
          });

          // Update last checked timestamp
          await supabaseAdmin
            .from('reddit_accounts')
            .update({ user_agent_last_checked: new Date().toISOString() })
            .eq('id', accountId);

          const parsed = parseUserAgent(testUserAgent);
          return NextResponse.json({
            success: true,
            userAgent: testUserAgent,
            browser: `${parsed.browser} (${parsed.os})`,
            device: parsed.device,
            tested: true
          });
        } catch (error: any) {
          console.error('Reddit API test error:', error);
          return NextResponse.json({
            error: `Reddit API test failed: ${error.message}`,
            userAgent: testUserAgent,
            details: error.toString()
          }, { status: 400 });
        } finally {
          // Restore proxy environment variables
          process.env.HTTP_PROXY = prevHttp;
          process.env.HTTPS_PROXY = prevHttps;
          if (prevNoProxy !== undefined) process.env.NO_PROXY = prevNoProxy; else delete process.env.NO_PROXY;
          console.log('test-user-agent: proxy_envs_restored');
        }
      }
    }

    // If no accountId or credentials, just validate the User Agent string
    if (!testUserAgent) {
      return NextResponse.json({ error: 'No User Agent provided' }, { status: 400 });
    }

    // Validate User Agent format
    const validation = validateUserAgent(testUserAgent);
    if (!validation.isValid) {
      return NextResponse.json({
        error: `Invalid User Agent: ${validation.issues.join(', ')}`,
        userAgent: testUserAgent
      }, { status: 400 });
    }

    // Parse User Agent for information
    const parsed = parseUserAgent(testUserAgent);

    return NextResponse.json({
      success: true,
      userAgent: testUserAgent,
      browser: `${parsed.browser} (${parsed.os})`,
      device: parsed.device,
      tested: false
    });

  } catch (error) {
    console.error('User Agent test error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}