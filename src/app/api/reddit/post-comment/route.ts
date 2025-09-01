import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import snoowrap from 'snoowrap';
import { AccountCooldownManager } from '../../../../lib/accountCooldownManager';
import { generateUserAgent } from '../../../../lib/redditService';

// Generate auto comment based on website config and discussion
function generateAutoComment(websiteConfig: any, discussion: any): string {
  const templates = [
    `Hey! I've been working on something that might help with this. Check out ${websiteConfig.website_url} - ${websiteConfig.website_description}`,
    `This is exactly what ${websiteConfig.website_url} was built for! ${websiteConfig.website_description}`,
    `I actually built a tool for this: ${websiteConfig.website_url}. ${websiteConfig.website_description}`,
    `You might find ${websiteConfig.website_url} useful for this. ${websiteConfig.website_description}`,
    `I've been working on ${websiteConfig.website_url} which does exactly this - ${websiteConfig.website_description}`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const internal = req.headers.get('X-Internal-API') === 'true';
    const { userId } = auth();

    if (!internal && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as {
      userId?: string;
      accountId: string;
      postId: string; // Reddit post ID (e.g., "1mx4yal")
      comment?: string;
      subreddit?: string;
      websiteConfig?: any;
      discussion?: any;
    };

    if (!internal) body.userId = userId!;

    const { accountId, postId, websiteConfig, discussion } = body;
    let { comment, subreddit } = body;

    // Auto-generate comment if not provided (for auto-poster)
    if (!comment && websiteConfig && discussion) {
      comment = generateAutoComment(websiteConfig, discussion);
      subreddit = discussion.subreddit;
    }

    if (!accountId || !postId || !comment) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Log attempt
    await supabaseAdmin.from('bot_logs').insert({
      user_id: body.userId || userId,
      action: 'comment_post_attempt',
      status: 'info',
      subreddit,
      message: `Attempting to comment on post ${postId}`,
    });

    // Quota check (similar to send-message)
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
        await supabaseAdmin.from('bot_logs').insert({
          user_id: body.userId || userId,
          action: 'quota_reached',
          status: 'error',
          subreddit,
          message: `Comment quota reached: ${used}/${planLimit}`,
        });
        return NextResponse.json({ error: 'quota_reached' }, { status: 402 });
      }
    }

    // Use cooldown manager to get available account
    const cooldownManager = new AccountCooldownManager();
    let account;

    if (accountId && accountId !== 'auto') {
      // Use specific account if provided and available
      const isAvailable = await cooldownManager.isAccountAvailable(accountId);
      if (!isAvailable) {
        return NextResponse.json({ 
          error: 'Account is on cooldown',
          status: 'rate_limited'
        }, { status: 429 });
      }

      const { data: specificAccount } = await supabaseAdmin
        .from('reddit_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('is_discussion_poster', true)
        .eq('is_validated', true)
        .single();

      if (!specificAccount) {
        return NextResponse.json({ error: 'Reddit account not found' }, { status: 404 });
      }
      account = specificAccount;
    } else {
      // Get next available account automatically
      account = await cooldownManager.getNextAvailableAccount();
      if (!account) {
        const waitTime = await cooldownManager.getEstimatedWaitTime();
        return NextResponse.json({ 
          error: 'No accounts available',
          status: 'rate_limited',
          estimatedWaitMinutes: waitTime
        }, { status: 429 });
      }
    }

    // Apply proxy settings (same as send-message)
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
        console.log('post-comment: proxy_enabled', `${account.proxy_type}://${account.proxy_host}:${account.proxy_port}`);
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
      }

      // Create Reddit client
      const customUserAgent = generateUserAgent({
        enabled: account.user_agent_enabled || false,
        type: account.user_agent_type || 'default',
        custom: account.user_agent_custom || undefined
      });

      const reddit = new snoowrap({
        userAgent: customUserAgent,
        clientId: account.client_id,
        clientSecret: account.client_secret,
        username: account.username,
        password: account.password,
      });

      console.log(`post-comment: using User Agent - ${account.user_agent_enabled ? 'Custom' : 'Default'}: ${customUserAgent.substring(0, 50)}...`);

      // Post comment
      try {
        const submission = reddit.getSubmission(postId);
        const commentResponse = await submission.reply(comment).then((response: any) => response);
        
        const commentUrl = `https://reddit.com/r/${subreddit}/comments/${postId}/_/${commentResponse.id}`;

        // Update counters
        await supabaseAdmin
          .from('users')
          .update({ message_count: (userRow?.message_count ?? 0) + 1 })
          .eq('id', body.userId || userId);

        // Mark account as used (cooldown starts)
        await cooldownManager.markAccountAsUsed(account.id);

        // Log success
        await supabaseAdmin.from('bot_logs').insert({
          user_id: body.userId || userId,
          action: 'comment_posted',
          status: 'success',
          subreddit,
          message: `Comment posted on ${postId}: ${commentUrl}`,
        });

        return NextResponse.json({ 
          success: true, 
          commentId: commentResponse.id,
          commentUrl,
          accountId: account.id
        });

      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        
        // Handle specific Reddit errors
        if (msg.includes('THREAD_LOCKED')) {
          await supabaseAdmin.from('bot_logs').insert({
            user_id: body.userId || userId,
            action: 'thread_locked',
            status: 'warning',
            subreddit,
            message: `Thread ${postId} is locked`,
          });
          return NextResponse.json({ skipped: true, reason: 'thread_locked' });
        }

        if (msg.includes('SUBREDDIT_NOTALLOWED') || msg.includes('USER_BLOCKED')) {
          await supabaseAdmin.from('bot_logs').insert({
            user_id: body.userId || userId,
            action: 'user_blocked_or_banned',
            status: 'warning',
            subreddit,
            message: `User blocked/banned in r/${subreddit}`,
          });
          return NextResponse.json({ skipped: true, reason: 'user_blocked' });
        }

        // Rate limiting - mark account as used since it attempted to post
        if (msg.includes('RATELIMIT') || msg.includes('you are doing that too much')) {
          await cooldownManager.markAccountAsUsed(account.id);
          await supabaseAdmin.from('bot_logs').insert({
            user_id: body.userId || userId,
            action: 'rate_limited',
            status: 'warning',
            subreddit,
            message: 'Reddit rate limit hit',
          });
          return NextResponse.json({ 
            error: 'rate_limited', 
            accountId: account.id 
          }, { status: 429 });
        }

        // Generic error
        await supabaseAdmin.from('bot_logs').insert({
          user_id: body.userId || userId,
          action: 'reddit_api_error',
          status: 'error',
          subreddit,
          error_message: msg.slice(0, 250),
        });
        return NextResponse.json({ error: 'reddit_comment_failed' }, { status: 502 });
      }

    } finally {
      // Restore proxy environment
      process.env.HTTP_PROXY = prevHttp;
      process.env.HTTPS_PROXY = prevHttps;
      if (prevNoProxy !== undefined) process.env.NO_PROXY = prevNoProxy; else delete process.env.NO_PROXY;
    }

  } catch (err) {
    console.error('post-comment error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
