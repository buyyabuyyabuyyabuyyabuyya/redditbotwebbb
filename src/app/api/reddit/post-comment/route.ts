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
    console.log('🔍 [POST-COMMENT] Starting account selection process...');
    const cooldownManager = new AccountCooldownManager();
    let account;

    if (accountId && accountId !== 'auto') {
      console.log(`🎯 [POST-COMMENT] Specific account requested: ${accountId}`);
      
      // Use specific account if provided and available
      const isAvailable = await cooldownManager.isAccountAvailable(accountId);
      console.log(`⏰ [POST-COMMENT] Account ${accountId} availability check: ${isAvailable}`);
      
      if (!isAvailable) {
        const cooldownInfo = await cooldownManager.getAccountCooldownInfo(accountId);
        console.log(`❌ [POST-COMMENT] Account ${accountId} availability check failed:`, cooldownInfo);
        
        // Only return 429 if actually on cooldown
        if (cooldownInfo.isOnCooldown) {
          return NextResponse.json({ 
            error: 'Account is on cooldown',
            status: 'rate_limited',
            cooldownInfo: cooldownInfo
          }, { status: 429 });
        }
        
        // If not on cooldown but still unavailable, it's a different error
        console.log(`⚠️ [POST-COMMENT] Account ${accountId} is unavailable but not on cooldown - may be authentication issue`);
        return NextResponse.json({ 
          error: 'Account unavailable',
          status: 'account_unavailable',
          cooldownInfo: cooldownInfo
        }, { status: 503 });
      }

      const { data: specificAccount } = await supabaseAdmin
        .from('reddit_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('is_discussion_poster', true)
        .eq('is_validated', true)
        .single();

      if (!specificAccount) {
        console.log(`❌ [POST-COMMENT] Reddit account ${accountId} not found in database`);
        return NextResponse.json({ error: 'Reddit account not found' }, { status: 404 });
      }
      
      console.log(`✅ [POST-COMMENT] Using specific account: ${specificAccount.username} (ID: ${specificAccount.id})`);
      console.log(`📊 [POST-COMMENT] Account details:`, {
        username: specificAccount.username,
        last_used_at: specificAccount.last_used_at,
        cooldown_minutes: specificAccount.cooldown_minutes,
        is_available: specificAccount.is_available,
        proxy_enabled: specificAccount.proxy_enabled
      });
      account = specificAccount;
    } else {
      console.log('🔄 [POST-COMMENT] Auto-selecting next available account...');
      
      // Get next available account automatically
      account = await cooldownManager.getNextAvailableAccount();
      
      if (!account) {
        console.log('❌ [POST-COMMENT] No accounts available for auto-selection');
        const waitTime = await cooldownManager.getEstimatedWaitTime();
        console.log(`⏳ [POST-COMMENT] Estimated wait time: ${waitTime} minutes`);
        
        // Get all accounts status for debugging
        const { data: allAccounts } = await supabaseAdmin
          .from('reddit_accounts')
          .select('id, username, last_used_at, cooldown_minutes, is_available, is_discussion_poster')
          .eq('is_discussion_poster', true)
          .eq('is_validated', true);
          
        console.log('📋 [POST-COMMENT] All discussion poster accounts status:', allAccounts?.map(acc => ({
          username: acc.username,
          last_used: acc.last_used_at,
          cooldown_mins: acc.cooldown_minutes,
          is_available: acc.is_available
        })));
        
        return NextResponse.json({ 
          error: 'No accounts available',
          status: 'rate_limited',
          estimatedWaitMinutes: waitTime,
          accountsStatus: allAccounts
        }, { status: 429 });
      }
      
      console.log(`✅ [POST-COMMENT] Auto-selected account: ${account.username} (ID: ${account.id})`);
      console.log(`📊 [POST-COMMENT] Selected account details:`, {
        username: account.username,
        last_used_at: account.last_used_at,
        cooldown_minutes: account.cooldown_minutes,
        is_available: account.is_available,
        proxy_enabled: account.proxy_enabled
      });
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
      console.log(`🚀 [POST-COMMENT] Attempting to post comment on ${postId}`);
      console.log(`💬 [POST-COMMENT] Comment content: ${comment.substring(0, 100)}...`);
      console.log(`🌐 [POST-COMMENT] Using proxy: ${account.proxy_enabled ? 'YES' : 'NO'}`);
      
      try {
        const submission = reddit.getSubmission(postId);
        console.log(`📝 [POST-COMMENT] Submission object created, posting reply...`);
        
        const commentResponse = await submission.reply(comment).then((response: any) => response);
        console.log(`✅ [POST-COMMENT] Reddit API response received:`, {
          commentId: commentResponse?.id,
          success: true
        });
        
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
        console.log(`❌ [POST-COMMENT] Reddit API error occurred:`);
        console.log(`🔍 [POST-COMMENT] Error message: ${msg}`);
        console.log(`🔍 [POST-COMMENT] Full error object:`, err);
        
        // Handle specific Reddit errors
        if (msg.includes('THREAD_LOCKED')) {
          console.log(`🔒 [POST-COMMENT] Thread is locked, skipping...`);
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
          console.log(`⏰ [POST-COMMENT] RATE LIMIT detected for account ${account.username}`);
          console.log(`🔄 [POST-COMMENT] Marking account ${account.id} as used (cooldown starts)`);
          
          await cooldownManager.markAccountAsUsed(account.id);
          
          // Get updated cooldown info
          const cooldownInfo = await cooldownManager.getAccountCooldownInfo(account.id);
          console.log(`📊 [POST-COMMENT] Account cooldown info after rate limit:`, cooldownInfo);
          
          await supabaseAdmin.from('bot_logs').insert({
            user_id: body.userId || userId,
            action: 'rate_limited',
            status: 'warning',
            subreddit,
            message: `Reddit rate limit hit for account ${account.username}`,
          });
          
          return NextResponse.json({ 
            error: 'rate_limited', 
            accountId: account.id,
            accountUsername: account.username,
            cooldownInfo: cooldownInfo,
            rateLimitMessage: msg
          }, { status: 429 });
        }

        // Generic error
        console.log(`💥 [POST-COMMENT] Unhandled Reddit error for account ${account.username}:`, msg);
        
        await supabaseAdmin.from('bot_logs').insert({
          user_id: body.userId || userId,
          action: 'reddit_api_error',
          status: 'error',
          subreddit,
          error_message: msg.slice(0, 250),
        });
        
        return NextResponse.json({ 
          error: 'reddit_comment_failed',
          accountId: account.id,
          accountUsername: account.username,
          errorMessage: msg,
          fullError: err
        }, { status: 502 });
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
