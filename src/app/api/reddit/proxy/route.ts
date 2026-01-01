import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRedditDiscussions, scrapeRedditHTML } from '../../../../lib/redditService';
import { filterRelevantDiscussions } from '../../../../lib/relevanceFiltering';
import { redditReplyService } from '../../../../lib/redditReplyService';
import { RedditPaginationManagerServer } from '../../../../lib/redditPaginationServer';
import { formatToPacificTime } from '../../../../lib/timeUtils';


const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

function getRandomUserAgent(): string {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Main auto-poster endpoint (primary, not backup)
export async function POST(req: Request): Promise<NextResponse> {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('Authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

    if (authHeader !== expectedAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query, subreddit, limit, userId, websiteConfig, configId } = await req.json();

    if (!query || !subreddit) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // If called from cron job (legacy mode), just return basic discussions without full auto-poster logic
    if (!userId || !websiteConfig) {
      console.log(`[REDDIT_PROXY] Legacy mode - fetching basic discussions for r/${subreddit}`);

      const discussions = await getRedditDiscussions(query, subreddit, limit || 10);

      return NextResponse.json({
        success: true,
        discussions: discussions.items,
        total: discussions.total
      });
    }

    // Ensure websiteConfig has required properties with fallbacks
    const safeWebsiteConfig = {
      website_url: websiteConfig?.website_url || '',
      website_description: websiteConfig?.website_description || '',
      target_keywords: websiteConfig?.target_keywords || [],
      negative_keywords: websiteConfig?.negative_keywords || [],
      customer_segments: websiteConfig?.customer_segments || [],
      relevance_threshold: websiteConfig?.relevance_threshold || 0.7,
      ...websiteConfig
    };

    console.log(`[REDDIT_PROXY] Starting complete auto-poster flow for r/${subreddit} with query: ${query}`);

    // Initialize Supabase
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Initialize pagination manager for this user/config
    const paginationManager = new RedditPaginationManagerServer(userId, configId);

    // Get smart pagination URL (auto-decides reset vs continue)
    const { url: redditUrl, isReset, state: paginationState } = await paginationManager.getSmartPaginationUrl(subreddit, limit || 10);
    console.log(`[REDDIT_PROXY] Pagination state for r/${subreddit}:`, paginationState ? `after=${paginationState.after}, total_fetched=${paginationState.total_fetched}, pages=${paginationState.pages_processed}` : 'first fetch');

    let discussions: any[] = [];
    let afterToken: string | null = null;
    let beforeToken: string | null = null;

    try {
      // Step 1: Fetch Reddit discussions via Cloudflare Worker Proxy
      const PROXY_WORKER_URL = 'https://redditprxy.devappshowcase.workers.dev/';
      const proxyUrl = `${PROXY_WORKER_URL}?url=${encodeURIComponent(redditUrl)}`;

      console.log(`[REDDIT_SERVICE] Fetching via Cloudflare Proxy: ${proxyUrl}`);

      // The Worker sets the User-Agent and other headers for the outgoing request to Reddit
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 403 || response.status === 429) {
          throw new Error(`REDDIT_BLOCK_${response.status}`);
        }
        throw new Error(`Reddit API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data?.data?.children || data.data.children.length === 0) {
        console.log('[REDDIT_PROXY] WARNING: Received 200 OK but no posts found. Raw data sample:', JSON.stringify(data).substring(0, 500));
      }

      console.log(`[REDDIT_PROXY] Fetched ${data?.data?.children?.length || 0} discussions from r/${subreddit}`);

      afterToken = data.data?.after || null;
      beforeToken = data.data?.before || null;

      // Parse discussions from JSON response
      discussions = data.data?.children
        ?.filter((post: any) => {
          const title = post.data.title.toLowerCase();
          const content = (post.data.selftext || '').toLowerCase();
          const queryLower = query.toLowerCase();

          // Split query into keywords for flexible matching
          const keywords = queryLower.split(' ').filter((k: string) => k.length > 3);

          // If no specific keywords (short query), revert to simple check
          if (keywords.length === 0) {
            return title.includes(queryLower) || content.includes(queryLower);
          }

          // Check if ANY keyword matches (OR logic)
          return keywords.some((k: string) => title.includes(k) || content.includes(k));
        })
        ?.map((post: any) => ({
          id: post.data.id,
          title: post.data.title,
          content: post.data.selftext || '',
          description: post.data.selftext || post.data.title,
          url: `https://reddit.com${post.data.permalink}`,
          subreddit: post.data.subreddit,
          author: post.data.author,
          score: post.data.score,
          num_comments: post.data.num_comments,
          created_utc: post.data.created_utc,
          raw_comment: post.data.selftext || post.data.title,
          is_self: post.data.is_self
        })) || [];

    } catch (error: any) {
      if (error.message && error.message.includes('REDDIT_BLOCK')) {
        console.warn(`[REDDIT_PROXY] JSON API blocked (${error.message}), switching to HTML scraping fallback...`);
        // Fallback to HTML scraping
        const htmlDiscussions = await scrapeRedditHTML(subreddit, query);
        console.log(`[REDDIT_PROXY] HTML scraping fallback found ${htmlDiscussions.length} discussions`);

        if (htmlDiscussions.length === 0) {
          throw new Error(`Reddit API blocked and HTML fallback returned 0 results`);
        }
        discussions = htmlDiscussions;
        // HTML scraping does not support standard pagination tokens
      } else {
        throw error;
      }
    }

    console.log(`[REDDIT_PROXY] Fetched ${discussions.length} discussions from r/${subreddit}`);

    // Delegate processing to helper function
    return await processDiscussions(
      discussions,
      req,
      userId,
      safeWebsiteConfig,
      configId,
      paginationManager,
      supabaseAdmin,
      subreddit,
      query,
      isReset,
      afterToken,
      beforeToken,
      limit
    );

  } catch (error) {
    console.error('[REDDIT_PROXY] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Helper function to process discussions (filter, score, post) to avoid code duplication between JSON and HTML paths
async function processDiscussions(
  discussions: any[],
  req: Request,
  userId: string,
  websiteConfig: any,
  configId: string,
  paginationManager: any,
  supabaseAdmin: any,
  subreddit: string,
  query: string,
  isReset: boolean,
  afterToken: string | null,
  beforeToken: string | null,
  limit: number
): Promise<NextResponse> {
  // Check if we've already posted to these discussions
  const postIds = discussions.map((d: any) => d.id);
  const alreadyPostedIds = await paginationManager.checkAlreadyPosted(postIds);

  // If ALL posts on this page are already processed, skip to next page
  // Only applicable if we have pagination tokens (JSON API)
  if (alreadyPostedIds.length === discussions.length && discussions.length > 0 && afterToken) {
    console.log(`[REDDIT_PROXY] All ${discussions.length} posts already processed, skipping to next page...`);

    // Update pagination to next page and recursively call
    await paginationManager.updatePaginationState(
      subreddit,
      afterToken,
      beforeToken,
      discussions.length,
      isReset
    );

    // Recursively fetch next page (with safety limit)
    const recursionDepth = (req as any).recursionDepth || 0;
    if (recursionDepth < 3) { // Max 3 recursive calls to avoid infinite loops
      console.log(`[REDDIT_PROXY] Recursively fetching next page (depth: ${recursionDepth + 1})`);
      const modifiedReq = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify({ query, subreddit, limit, userId, websiteConfig, configId })
      });
      (modifiedReq as any).recursionDepth = recursionDepth + 1;
      return POST(modifiedReq);
    }
  }

  // Update pagination state after successful fetch
  if (discussions.length > 0) {
    await paginationManager.updatePaginationState(
      subreddit,
      afterToken, // might be null for HTML fallback
      beforeToken, // might be null for HTML fallback
      discussions.length,
      isReset
    );
    console.log(`[REDDIT_PROXY] Updated pagination state: fetched ${discussions.length} posts`);
  }

  if (!discussions || discussions.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No discussions found',
      discussions: [],
      total: 0
    });
  }

  // Step 2: Filter out already posted discussions
  const newDiscussions = discussions.filter((d: any) => !alreadyPostedIds.includes(d.id));
  console.log(`[REDDIT_PROXY] Found ${alreadyPostedIds.length} already posted discussions to exclude`);
  console.log(`[REDDIT_PROXY] ${newDiscussions.length} new discussions to process`);

  if (newDiscussions.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'All discussions already processed',
      discussions: [],
      total: 0
    });
  }

  // Step 3: Apply relevance filtering with Gemini AI scoring
  const relevantDiscussions = await filterRelevantDiscussions(
    newDiscussions,
    websiteConfig,
    alreadyPostedIds
  );

  console.log(`[REDDIT_PROXY] ${relevantDiscussions.length} discussions passed relevance filtering`);

  if (relevantDiscussions.length === 0) {
    // Rotate to next subreddit since current one has no relevant posts
    if (configId) {
      const { data: currentConfig } = await supabaseAdmin
        .from('auto_poster_configs')
        .select('current_subreddit_index')
        .eq('id', configId)
        .single();

      const BUSINESS_SUBREDDITS = ['entrepreneur', 'startups', 'SaaS', 'business', 'smallbusiness', 'productivity', 'marketing'];
      const currentIndex = currentConfig?.current_subreddit_index || 0;
      const nextIndex = (currentIndex + 1) % BUSINESS_SUBREDDITS.length;

      await supabaseAdmin
        .from('auto_poster_configs')
        .update({
          current_subreddit_index: nextIndex,
          last_subreddit_used: BUSINESS_SUBREDDITS[nextIndex]
        })
        .eq('id', configId);

      console.log(`[REDDIT_PROXY] No relevant discussions - rotated to next subreddit: ${BUSINESS_SUBREDDITS[nextIndex]}`);
    }

    return NextResponse.json({
      success: true,
      message: 'No relevant discussions after filtering',
      discussions: [],
      total: 0,
      filtered: discussions.length
    });
  }

  // Step 4: Get available Reddit account
  const { data: availableAccounts } = await supabaseAdmin
    .from('reddit_accounts')
    .select('*')
    .eq('is_validated', true)
    .eq('is_discussion_poster', true)
    .eq('status', 'active')
    .order('last_used_at', { ascending: true, nullsFirst: true });

  // Filter accounts that are actually available (not in cooldown)
  const now = new Date();
  const availableAccountsFiltered = availableAccounts?.filter((account: any) => {
    if (account.is_available) return true;

    // Check if cooldown has expired despite is_available being false
    if (account.current_cooldown_until) {
      return now >= new Date(account.current_cooldown_until);
    }

    // Fallback to last_used_at + cooldown_minutes
    if (account.last_used_at) {
      const lastUsed = new Date(account.last_used_at);
      const cooldownMinutes = account.cooldown_minutes || 30;
      const cooldownExpiry = new Date(lastUsed.getTime() + cooldownMinutes * 60 * 1000);
      return now >= cooldownExpiry;
    }

    return false;
  }) || [];

  const redditAccount = availableAccountsFiltered[0];

  if (!redditAccount) {
    console.error(`[REDDIT_PROXY] No Reddit accounts available for posting (Checked ${availableAccounts?.length || 0} accounts)`);
    return NextResponse.json({
      success: false,
      error: 'No Reddit accounts available',
      accountStatuses: availableAccounts?.map((a: any) => ({
        username: a.username,
        is_available: a.is_available,
        cooldown_until: a.current_cooldown_until,
        last_used: formatToPacificTime(a.last_used_at)
      }))
    }, { status: 503 });
  }

  console.log(`[REDDIT_PROXY] Using Reddit account: ${redditAccount.username} (Available since ${formatToPacificTime(redditAccount.current_cooldown_until || redditAccount.last_used_at)})`);

  // Step 5: Process discussions with Gemini AI and post replies
  // Add a small 2s pause here to let TPM limits cool down after the scoring batch
  await new Promise(resolve => setTimeout(resolve, 2000));

  let posted = false;
  let postResult = null;

  for (const { discussion, scores } of relevantDiscussions.slice(0, 1)) { // Process only top discussion
    console.log(`[REDDIT_PROXY] Processing discussion ${discussion.id} (score: ${scores.finalScore})`);

    try {
      // Use redditReplyService for Gemini-powered reply generation and posting
      const result = await redditReplyService.generateAndPostReply(
        {
          id: discussion.id,
          title: discussion.title,
          selftext: discussion.content || '',
          url: discussion.url,
          subreddit: discussion.subreddit,
          score: discussion.score || 0,
          permalink: discussion.url
        },
        {
          tone: 'pseudo-advice marketing',
          maxLength: 500,
          keywords: websiteConfig.target_keywords || [],
          accountId: redditAccount.id,
          userId: userId
        }
      );

      if (result.success) {
        console.log(`[REDDIT_PROXY] Successfully posted reply to discussion ${discussion.id}`);

        // Record the posted discussion
        const { error: insertError } = await supabaseAdmin
          .from('posted_reddit_discussions')
          .insert({
            website_config_id: websiteConfig.id, // Use the correct Website Config UUID, not the Auto-Poster Config ID
            reddit_post_id: discussion.id,
            reddit_account_id: redditAccount.id,
            subreddit: discussion.subreddit,
            post_title: discussion.title,
            comment_id: result.commentId,
            comment_url: result.commentUrl,
            comment_text: result.generatedReply,
            relevance_score: Math.round(scores.finalScore)
          });

        if (insertError) {
          console.error(`[REDDIT_PROXY] [${formatToPacificTime(new Date())}] Database error recording discussion ${discussion.id}:`, insertError);
        } else {
          console.log(`[REDDIT_PROXY] [${formatToPacificTime(new Date())}] Successfully recorded posted discussion ${discussion.id} in database`);
        }

        // Update config post count and rotate subreddit
        if (configId) {
          // Get current config to determine next subreddit index
          const { data: currentConfig } = await supabaseAdmin
            .from('auto_poster_configs')
            .select('current_subreddit_index')
            .eq('id', configId)
            .single();

          const BUSINESS_SUBREDDITS = ['entrepreneur', 'startups', 'SaaS', 'business', 'smallbusiness', 'productivity', 'marketing'];
          const currentIndex = currentConfig?.current_subreddit_index || 0;
          const nextIndex = (currentIndex + 1) % BUSINESS_SUBREDDITS.length;

          await supabaseAdmin
            .from('auto_poster_configs')
            .update({
              posts_today: 1, // Will be incremented by trigger
              last_posted_at: new Date().toISOString(),
              current_subreddit_index: nextIndex,
              last_subreddit_used: BUSINESS_SUBREDDITS[nextIndex]
            })
            .eq('id', configId);
        }

        posted = true;
        postResult = result;
        break; // Only post one reply per run
      } else {
        console.log(`[REDDIT_PROXY] Failed to post reply: ${result.error}`);
      }
    } catch (error) {
      console.error(`[REDDIT_PROXY] Error processing discussion ${discussion.id}:`, error);
    }
  }

  return NextResponse.json({
    success: true,
    discussions: discussions,
    total: discussions.length, // approximation for now
    filtered: discussions.length,
    relevant: relevantDiscussions.length,
    posted: posted,
    postResult: postResult
  });
}
