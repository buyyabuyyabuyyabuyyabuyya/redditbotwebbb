import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';
import Snoowrap from 'snoowrap';
import { generateUserAgent } from '../../../../utils/userAgents';

// Initialize Supabase client with admin privileges
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Helper function to retry Reddit API calls with exponential backoff
async function retryRedditApiCall<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  initialDelay: number = 500
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if it's a 500 error from Reddit
      const is500Error = error?.statusCode === 500 ||
        error?.message?.includes('500') ||
        error?.message?.includes('Internal Server Error');

      // Only retry on 500 errors and if we have retries left
      if (is500Error && attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Reddit API returned 500 error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // If it's not a 500 error or we're out of retries, throw
      throw error;
    }
  }

  throw lastError;
}

// Helper function to wait for a specified duration
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// GET endpoint to fetch Reddit private messages
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the account ID from the URL parameters
    const accountId = request.nextUrl.searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Verify that the account belongs to the user
    const { data: account, error: accountError } = await supabaseAdmin
      .from('reddit_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Use the Reddit API to fetch actual messages
    try {
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
          console.log('private-messages: proxy_enabled', `${account.proxy_type}://${account.proxy_host}:${account.proxy_port}`);
        } else {
          // Aggressively clear ALL proxy environment variables BEFORE setting NO_PROXY
          // This ensures a clean state and prevents pollution from previous requests
          const varsToDelete = [
            'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy',
            'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy',
            'NODE_TLS_REJECT_UNAUTHORIZED'
          ];
          varsToDelete.forEach(varName => delete process.env[varName]);

          // Now set NO_PROXY after cleanup
          process.env.NO_PROXY = '*';
          process.env.no_proxy = '*';
          console.log('private-messages: proxy_disabled');
        }

        // Wait a bit to ensure environment variables are fully propagated
        // This prevents race conditions in serverless environments
        await wait(100);

        // Create a Reddit API client with custom User Agent
        const customUserAgent = generateUserAgent({
          enabled: account.user_agent_enabled || false,
          type: account.user_agent_type || 'default',
          custom: account.user_agent_custom || undefined
        });
        const reddit = new Snoowrap({
          userAgent: customUserAgent,
          clientId: account.client_id,
          clientSecret: account.client_secret,
          username: account.username,
          password: account.password,
        });

        console.log(`Fetching messages for Reddit account: ${account.username}`);

        // Get limit parameter from query string or use default (100 is typically the Reddit API max)
        const limit = parseInt(
          request.nextUrl.searchParams.get('limit') || '100'
        );
        console.log(
          `Fetching up to ${limit} messages for each category (inbox & sent)`
        );

        // Fetch both inbox and sent messages with increased limit
        // Use type assertion since the Snoowrap type definitions might be incomplete
        // Wrap in retry logic to handle transient Reddit API 500 errors
        const [inbox, sent] = await retryRedditApiCall(async () => {
          const inboxResult = await reddit.getInbox({ limit } as any);
          const sentResult = await reddit.getSentMessages({ limit } as any);
          return [inboxResult, sentResult];
        });

        // Process and combine the messages
        const inboxMessages = inbox.map((msg: any) => ({
          id: msg.id,
          subject: msg.subject || 'No Subject',
          body: msg.body,
          author: msg.author?.name || 'Unknown',
          created_utc: msg.created_utc,
          isIncoming: true,
          wasRead: !msg.new,
        }));

        const sentMessages = sent.map((msg: any) => ({
          id: msg.id,
          subject: msg.subject || 'No Subject',
          body: msg.body,
          author: msg.dest || 'Unknown',
          created_utc: msg.created_utc,
          isIncoming: false,
          wasRead: true,
        }));

        // Combine and sort by creation time (newest first)
        const allMessages = [...inboxMessages, ...sentMessages].sort(
          (a, b) => b.created_utc - a.created_utc
        );

        return NextResponse.json({ messages: allMessages });
      } finally {
        process.env.HTTP_PROXY = prevHttp;
        process.env.HTTPS_PROXY = prevHttps;
        if (prevNoProxy !== undefined) process.env.NO_PROXY = prevNoProxy; else delete process.env.NO_PROXY;
        console.log('private-messages: proxy_envs_restored');
      }
    } catch (redditError) {
      console.error('Error fetching Reddit messages:', redditError);
      return NextResponse.json(
        {
          error: 'Failed to fetch messages from Reddit',
          details:
            redditError instanceof Error
              ? redditError.message
              : 'Unknown error',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST endpoint to send a message reply
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId, messageId, body } = await request.json();

    if (!accountId || !messageId || !body) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify that the account belongs to the user
    const { data: account, error: accountError } = await supabaseAdmin
      .from('reddit_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    try {
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
          console.log('private-messages: proxy_enabled', `${account.proxy_type}://${account.proxy_host}:${account.proxy_port}`);
        } else {
          // Aggressively clear ALL proxy environment variables BEFORE setting NO_PROXY
          // This ensures a clean state and prevents pollution from previous requests
          const varsToDelete = [
            'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy',
            'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy',
            'NODE_TLS_REJECT_UNAUTHORIZED'
          ];
          varsToDelete.forEach(varName => delete process.env[varName]);

          // Now set NO_PROXY after cleanup
          process.env.NO_PROXY = '*';
          process.env.no_proxy = '*';
          console.log('private-messages: proxy_disabled');
        }

        // Wait a bit to ensure environment variables are fully propagated
        await wait(100);

        // Use the Reddit API to actually send the reply
        try {
          // Create a Reddit API client with custom User Agent
          const customUserAgent = generateUserAgent({
            enabled: account.user_agent_enabled || false,
            type: account.user_agent_type || 'default',
            custom: account.user_agent_custom || undefined
          });
          const reddit = new Snoowrap({
            userAgent: customUserAgent,
            clientId: account.client_id,
            clientSecret: account.client_secret,
            username: account.username,
            password: account.password,
          });

          console.log(
            `Sending reply to message ${messageId} from account ${account.username}`
          );

          // Get the message and then reply to it
          const message = await (reddit.getMessage(messageId) as any);
          await message.reply(body);

          // Update user's message count
          const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('message_count')
            .eq('id', userId)
            .single();

          if (!userError && userData) {
            await supabaseAdmin
              .from('users')
              .update({ message_count: (userData.message_count || 0) + 1 })
              .eq('id', userId);
          }

          return NextResponse.json({ success: true });
        } catch (redditError) {
          console.error('Error sending message reply on Reddit:', redditError);
          return NextResponse.json(
            {
              error: 'Failed to send reply on Reddit',
              details:
                redditError instanceof Error
                  ? redditError.message
                  : 'Unknown error',
            },
            { status: 500 }
          );
        }
      } finally {
        process.env.HTTP_PROXY = prevHttp;
        process.env.HTTPS_PROXY = prevHttps;
        if (prevNoProxy !== undefined) process.env.NO_PROXY = prevNoProxy; else delete process.env.NO_PROXY;
        console.log('private-messages: proxy_envs_restored');
      }
    } catch (error) {
      console.error('Error sending message reply:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error sending message reply:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
