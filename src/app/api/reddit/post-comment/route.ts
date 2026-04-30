import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import snoowrap from 'snoowrap';
import { AccountCooldownManager } from '../../../../lib/accountCooldownManager';
import { generateUserAgent } from '../../../../lib/redditService';
import { normalizeProductContext } from '../../../../lib/redditReplyPrompt';
import { getPlanLimits } from '../../../../utils/planLimits';

// Generate auto comment based on website config and discussion
function generateAutoComment(websiteConfig: any, discussion: any): string {
  const context = normalizeProductContext(websiteConfig);
  const productMention = context.productUrl
    ? `${context.productName} (${context.productUrl})`
    : context.productName;
  const postText = `${discussion?.title || ''} ${discussion?.content || discussion?.selftext || ''}`.toLowerCase();
  const isTechnical = /api|code|bug|error|stack|tool|workflow|automate|integration|setup|build|deploy/.test(postText);
  const opener = isTechnical
    ? 'The bottleneck here sounds like reducing manual steps without adding another messy workflow.'
    : 'That sounds frustrating, especially when the problem keeps costing time after you already know what you want.';

  const templates = [
    `${opener} One option worth comparing is ${productMention} because ${context.productDescription} A free thing to try first: write down the repeated step that wastes the most time and solve only that part first.`,
    `${opener} ${productMention} may fit if the main issue is ${context.productDescription.toLowerCase()} Also worth checking Reddit search for older threads with the same constraint before committing to any tool.`,
    `${opener} A practical way to approach it is to fix the painful repeat task first; ${productMention} is relevant here because ${context.productDescription} Free tip: make a tiny checklist so you can tell whether any recommendation actually saves time.`,
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

    const body = (await req.json()) as {
      userId?: string;
      accountId?: string;
      postId: string; // Reddit post ID (e.g., "1mx4yal")
      comment?: string;
      subreddit?: string;
      websiteConfig?: any;
      discussion?: any;
      websiteConfigId?: string;
      postTitle?: string;
      relevanceScore?: number;
    };

    if (!internal) body.userId = userId!;
    const postingUserId = body.userId || userId;

    if (!postingUserId) {
      return NextResponse.json({ error: 'Missing user context' }, { status: 400 });
    }

    const {
      postId,
      websiteConfig,
      discussion,
      websiteConfigId,
      postTitle,
      relevanceScore,
    } = body;
    const accountId = body.accountId || 'auto';
    let { comment, subreddit } = body;

    // Auto-generate comment if not provided (for auto-poster)
    if (!comment && websiteConfig && discussion) {
      comment = generateAutoComment(websiteConfig, discussion);
      subreddit = discussion.subreddit;
    }

    if (!postId || !comment) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Log attempt
    await supabaseAdmin.from('bot_logs').insert({
      user_id: postingUserId,
      action: 'comment_post_attempt',
      status: 'info',
      subreddit,
      message: `Attempting to comment on post ${postId}`,
    });

    // Quota check for monthly comment actions.
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('subscription_status, message_count')
      .eq('id', postingUserId)
      .maybeSingle();

    const limits = getPlanLimits(userRow?.subscription_status);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { count: monthlyCommentCount, error: monthlyCountError } =
      await supabaseAdmin
        .from('posted_reddit_discussions')
        .select('id, website_configs!inner(user_id)', {
          count: 'exact',
          head: true,
        })
        .eq('website_configs.user_id', postingUserId)
        .gte('created_at', monthStart.toISOString());

    if (monthlyCountError) {
      console.error('Failed to check monthly comment usage:', monthlyCountError);
      return NextResponse.json(
        { error: 'Failed to check comment usage' },
        { status: 500 }
      );
    }

    const usedThisMonth = monthlyCommentCount || 0;
    if (usedThisMonth >= limits.monthlyCommentLimit) {
      await supabaseAdmin.from('bot_logs').insert({
        user_id: postingUserId,
        action: 'quota_reached',
        status: 'error',
        subreddit,
        message: `Monthly comment limit reached: ${usedThisMonth}/${limits.monthlyCommentLimit}`,
      });
      return NextResponse.json(
        {
          error: 'monthly_comment_limit_reached',
          limit: limits.monthlyCommentLimit,
          current: usedThisMonth,
        },
        { status: 402 }
      );
    }

    // Use cooldown manager to get available account
    console.log('🔍 [POST-COMMENT] Starting account selection process...');
    const cooldownManager = new AccountCooldownManager();
    let account;

    if (accountId && accountId !== 'auto') {
      console.log(`🎯 [POST-COMMENT] Specific account requested: ${accountId}`);

      // Use specific account if provided and available
      const isAvailable = await cooldownManager.isAccountAvailable(accountId);
      console.log(
        `⏰ [POST-COMMENT] Account ${accountId} availability check: ${isAvailable}`
      );

      if (!isAvailable) {
        const cooldownInfo =
          await cooldownManager.getAccountCooldownInfo(accountId);
        console.log(
          `❌ [POST-COMMENT] Account ${accountId} availability check failed:`,
          cooldownInfo
        );

        // Only return 429 if actually on cooldown
        if (cooldownInfo.isOnCooldown) {
          return NextResponse.json(
            {
              error: 'Account is on cooldown',
              status: 'rate_limited',
              cooldownInfo: cooldownInfo,
            },
            { status: 429 }
          );
        }

        // If not on cooldown but still unavailable, it's a different error
        console.log(
          `⚠️ [POST-COMMENT] Account ${accountId} is unavailable but not on cooldown - may be authentication issue`
        );
        return NextResponse.json(
          {
            error: 'Account unavailable',
            status: 'account_unavailable',
            cooldownInfo: cooldownInfo,
          },
          { status: 503 }
        );
      }

      const { data: specificAccount } = await supabaseAdmin
        .from('reddit_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('is_discussion_poster', true)
        .eq('is_validated', true)
        .eq('is_available', true)
        .single();

      if (!specificAccount) {
        console.log(
          `❌ [POST-COMMENT] Reddit account ${accountId} not found in database`
        );
        return NextResponse.json(
          { error: 'Reddit account not found' },
          { status: 404 }
        );
      }

      console.log(
        `✅ [POST-COMMENT] Using specific account: ${specificAccount.username} (ID: ${specificAccount.id})`
      );
      console.log(`📊 [POST-COMMENT] Account details:`, {
        username: specificAccount.username,
        last_used_at: specificAccount.last_used_at,
        cooldown_minutes: specificAccount.cooldown_minutes,
        is_available: specificAccount.is_available,
        proxy_enabled: specificAccount.proxy_enabled,
      });
      account = specificAccount;
    } else {
      console.log('🔄 [POST-COMMENT] Auto-selecting next available account...');

      // Get next available account automatically
      account = await cooldownManager.getNextAvailableAccount();

      if (!account) {
        console.log(
          '❌ [POST-COMMENT] No accounts available for auto-selection'
        );
        const waitTime = await cooldownManager.getEstimatedWaitTime();
        console.log(
          `⏳ [POST-COMMENT] Estimated wait time: ${waitTime} minutes`
        );

        // Get all accounts status for debugging
        const { count: platformAccountCount } = await supabaseAdmin
          .from('reddit_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('is_discussion_poster', true)
          .eq('is_validated', true);

        console.log(
          `[POST-COMMENT] Managed posting network accounts tracked: ${platformAccountCount || 0}`
        );

        return NextResponse.json(
          {
            error: 'No accounts available',
            status: 'rate_limited',
            estimatedWaitMinutes: waitTime,
            poolStatus: {
              status: waitTime > 0 ? 'limited' : 'offline',
              nextAvailableIn: waitTime,
            },
          },
          { status: 429 }
        );
      }

      console.log(
        `✅ [POST-COMMENT] Auto-selected account: ${account.username} (ID: ${account.id})`
      );
      console.log(`📊 [POST-COMMENT] Selected account details:`, {
        username: account.username,
        last_used_at: account.last_used_at,
        cooldown_minutes: account.cooldown_minutes,
        is_available: account.is_available,
        proxy_enabled: account.proxy_enabled,
      });
    }

    // Apply proxy settings for the selected account
    const prevHttp = process.env.HTTP_PROXY;
    const prevHttps = process.env.HTTPS_PROXY;
    const prevNoProxy = process.env.NO_PROXY;

    try {
      if (
        account.proxy_enabled &&
        account.proxy_host &&
        account.proxy_port &&
        account.proxy_type
      ) {
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
        console.log(
          'post-comment: proxy_enabled',
          `${account.proxy_type}://${account.proxy_host}:${account.proxy_port}`
        );
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
        custom: account.user_agent_custom || undefined,
      });

      const reddit = new snoowrap({
        userAgent: customUserAgent,
        clientId: account.client_id,
        clientSecret: account.client_secret,
        username: account.username,
        password: account.password,
      });

      console.log(
        `post-comment: using User Agent - ${account.user_agent_enabled ? 'Custom' : 'Default'}: ${customUserAgent.substring(0, 50)}...`
      );

      // Post comment
      console.log(`🚀 [POST-COMMENT] Attempting to post comment on ${postId}`);
      console.log(
        `💬 [POST-COMMENT] Comment content: ${comment.substring(0, 100)}...`
      );
      console.log(
        `🌐 [POST-COMMENT] Using proxy: ${account.proxy_enabled ? 'YES' : 'NO'}`
      );

      try {
        const submission = reddit.getSubmission(postId);
        console.log(
          `📝 [POST-COMMENT] Submission object created, posting reply...`
        );

        const commentResponse = await submission
          .reply(comment)
          .then((response: any) => response);
        console.log(`✅ [POST-COMMENT] Reddit API response received:`, {
          commentId: commentResponse?.id,
          success: true,
        });

        const commentUrl = `https://reddit.com/r/${subreddit}/comments/${postId}/_/${commentResponse.id}`;

        // Update counters
        await supabaseAdmin
          .from('users')
          .update({ message_count: (userRow?.message_count ?? 0) + 1 })
          .eq('id', postingUserId);

        if (websiteConfigId) {
          const { data: ownedConfig } = await supabaseAdmin
            .from('website_configs')
            .select('id')
            .eq('id', websiteConfigId)
            .eq('user_id', postingUserId)
            .maybeSingle();

          if (ownedConfig) {
            const { data: existingRecord } = await supabaseAdmin
              .from('posted_reddit_discussions')
              .select('id')
              .eq('website_config_id', websiteConfigId)
              .eq('reddit_post_id', postId)
              .maybeSingle();

            if (!existingRecord) {
              await supabaseAdmin.from('posted_reddit_discussions').insert({
                website_config_id: websiteConfigId,
                reddit_post_id: postId,
                reddit_account_id: account.id,
                subreddit: subreddit || '',
                post_title: postTitle || '',
                comment_id: commentResponse.id,
                comment_url: commentUrl,
                comment_text: comment,
                relevance_score: relevanceScore || null,
              });
            }
          }
        }

        // Mark account as used (cooldown starts)
        await cooldownManager.markAccountAsUsed(account.id);

        // Log success
        await supabaseAdmin.from('bot_logs').insert({
          user_id: postingUserId,
          action: 'comment_posted',
          status: 'success',
          subreddit,
          message: `Comment posted on ${postId}: ${commentUrl}`,
        });

        return NextResponse.json({
          success: true,
          commentId: commentResponse.id,
          commentUrl,
          ...(internal ? { accountId: account.id } : {}),
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
            user_id: postingUserId,
            action: 'thread_locked',
            status: 'warning',
            subreddit,
            message: `Thread ${postId} is locked`,
          });
          return NextResponse.json({ skipped: true, reason: 'thread_locked' });
        }

        if (
          msg.includes('SUBREDDIT_NOTALLOWED') ||
          msg.includes('USER_BLOCKED')
        ) {
          await supabaseAdmin.from('bot_logs').insert({
            user_id: postingUserId,
            action: 'user_blocked_or_banned',
            status: 'warning',
            subreddit,
            message: `User blocked/banned in r/${subreddit}`,
          });
          return NextResponse.json({ skipped: true, reason: 'user_blocked' });
        }

        // Rate limiting - mark account as used since it attempted to post
        if (
          msg.includes('RATELIMIT') ||
          msg.includes('you are doing that too much')
        ) {
          console.log(
            `⏰ [POST-COMMENT] RATE LIMIT detected for account ${account.username}`
          );
          console.log(
            `🔄 [POST-COMMENT] Marking account ${account.id} as used (cooldown starts)`
          );

          await cooldownManager.markAccountAsUsed(account.id);

          // Get updated cooldown info
          const cooldownInfo = await cooldownManager.getAccountCooldownInfo(
            account.id
          );
          console.log(
            `📊 [POST-COMMENT] Account cooldown info after rate limit:`,
            cooldownInfo
          );

          await supabaseAdmin.from('bot_logs').insert({
            user_id: postingUserId,
            action: 'rate_limited',
            status: 'warning',
            subreddit,
            message: `Reddit rate limit hit for account ${account.username}`,
          });

          return NextResponse.json(
            {
              error: 'rate_limited',
              ...(internal
                ? {
                    accountId: account.id,
                    accountUsername: account.username,
                    cooldownInfo,
                  }
                : {}),
              rateLimitMessage: msg,
            },
            { status: 429 }
          );
        }

        // Generic error
        console.log(
          `💥 [POST-COMMENT] Unhandled Reddit error for account ${account.username}:`,
          msg
        );

        await supabaseAdmin.from('bot_logs').insert({
          user_id: postingUserId,
          action: 'reddit_api_error',
          status: 'error',
          subreddit,
          error_message: msg.slice(0, 250),
        });

        return NextResponse.json(
          {
            error: 'reddit_comment_failed',
            ...(internal
              ? {
                  accountId: account.id,
                  accountUsername: account.username,
                }
              : {}),
            errorMessage: msg,
            fullError: err,
          },
          { status: 502 }
        );
      }
    } finally {
      // Restore proxy environment
      process.env.HTTP_PROXY = prevHttp;
      process.env.HTTPS_PROXY = prevHttps;
      if (prevNoProxy !== undefined) process.env.NO_PROXY = prevNoProxy;
      else delete process.env.NO_PROXY;
    }
  } catch (err) {
    console.error('post-comment error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
