import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getRedditDiscussions,
  scrapeRedditHTML,
} from '../../../../lib/redditService';
import { filterRelevantDiscussions } from '../../../../lib/relevanceFiltering';
import { redditReplyService } from '../../../../lib/redditReplyService';
import { RedditPaginationManagerServer } from '../../../../lib/redditPaginationServer';
import { formatToPacificTime } from '../../../../lib/timeUtils';
import {
  decodeWebsiteConfigCollections,
  getWebsiteConfigSubreddits,
} from '@/lib/websiteConfigCollections';

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

function getRandomUserAgent(): string {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function normalizeSubredditName(subreddit: string | null | undefined): string {
  return (subreddit || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?reddit\.com\/r\//i, '')
    .replace(/^\/?r\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

function getSubredditRotation(websiteConfig: any): string[] {
  const configured = getWebsiteConfigSubreddits(websiteConfig)
    .map(normalizeSubredditName)
    .filter(Boolean);

  if (configured.length > 0) {
    return Array.from(new Set(configured));
  }

  return [];
}

async function updateSubredditRotation(
  supabaseAdmin: any,
  configId: string | undefined,
  subredditRotation: string[],
  nextIndex: number,
  reason: string,
  extraUpdates: Record<string, any> = {}
) {
  if (!configId || subredditRotation.length === 0) return;

  const normalizedIndex =
    ((nextIndex % subredditRotation.length) + subredditRotation.length) %
    subredditRotation.length;
  const nextSubreddit = subredditRotation[normalizedIndex];

  const { error } = await supabaseAdmin
    .from('auto_poster_configs')
    .update({
      current_subreddit_index: normalizedIndex,
      last_subreddit_used: nextSubreddit,
      ...extraUpdates,
    })
    .eq('id', configId);

  if (error) {
    console.error(
      `[REDDIT_PROXY] Failed to update subreddit rotation after ${reason}:`,
      error
    );
    return;
  }

  console.log(
    `[REDDIT_PROXY] Rotation updated after ${reason}: next r/${nextSubreddit} (index ${normalizedIndex})`
  );
}

async function getStartingSubredditIndex(
  supabaseAdmin: any,
  configId: string | undefined,
  subredditRotation: string[],
  requestedSubreddit: string
): Promise<number> {
  if (subredditRotation.length === 0) return 0;

  const requestedIndex = subredditRotation.indexOf(
    normalizeSubredditName(requestedSubreddit)
  );
  if (requestedIndex >= 0) return requestedIndex;

  if (!configId) return 0;

  const { data: currentConfig } = await supabaseAdmin
    .from('auto_poster_configs')
    .select('current_subreddit_index')
    .eq('id', configId)
    .single();

  const storedIndex = currentConfig?.current_subreddit_index;
  if (
    typeof storedIndex === 'number' &&
    storedIndex >= 0 &&
    storedIndex < subredditRotation.length
  ) {
    return storedIndex;
  }

  return 0;
}

async function fetchSubredditDiscussions({
  subreddit,
  query,
  limit,
  paginationManager,
}: {
  subreddit: string;
  query: string;
  limit: number;
  paginationManager: RedditPaginationManagerServer;
}) {
  const {
    url: redditUrl,
    isReset,
    state: paginationState,
  } = await paginationManager.getSmartPaginationUrl(subreddit, limit);

  console.log(
    `[REDDIT_PROXY] Pagination state for r/${subreddit}:`,
    paginationState
      ? `after=${paginationState.after}, total_fetched=${paginationState.total_fetched}, pages=${paginationState.pages_processed}`
      : 'first fetch'
  );

  let discussions: any[] = [];
  let afterToken: string | null = null;
  let beforeToken: string | null = null;
  let rawFetched = 0;

  try {
    const PROXY_WORKER_URL = 'https://redditprxy.devappshowcase.workers.dev/';
    const proxyUrl = `${PROXY_WORKER_URL}?url=${encodeURIComponent(redditUrl)}`;

    console.log(`[REDDIT_SERVICE] Fetching via Cloudflare Proxy: ${proxyUrl}`);

    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': getRandomUserAgent(),
      },
    });

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        throw new Error(`REDDIT_BLOCK_${response.status}`);
      }
      throw new Error(`Reddit API error: ${response.status}`);
    }

    const data = await response.json();
    const children = data?.data?.children || [];
    rawFetched = children.length;

    if (children.length === 0) {
      console.log(
        '[REDDIT_PROXY] WARNING: Received 200 OK but no posts found. Raw data sample:',
        JSON.stringify(data).substring(0, 500)
      );
    }

    console.log(
      `[REDDIT_PROXY] Raw fetch returned ${children.length} discussions from r/${subreddit}`
    );

    afterToken = data.data?.after || null;
    beforeToken = data.data?.before || null;

    const skipped = {
      missingFields: 0,
      stickied: 0,
      removed: 0,
    };

    discussions = children
      .filter((post: any) => {
        const postData = post?.data;
        if (!postData?.id || !postData?.title) {
          skipped.missingFields += 1;
          return false;
        }

        if (postData.stickied) {
          skipped.stickied += 1;
          return false;
        }

        if (postData.removed_by_category || postData.banned_by) {
          skipped.removed += 1;
          return false;
        }

        return true;
      })
      .map((post: any) => ({
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
        is_self: post.data.is_self,
        over_18: post.data.over_18,
        stickied: post.data.stickied,
      }));

    console.log(
      `[REDDIT_PROXY] Candidate filter kept ${discussions.length}/${rawFetched} posts for r/${subreddit}; skipped=${JSON.stringify(skipped)}`
    );
  } catch (error: any) {
    if (error.message && error.message.includes('REDDIT_BLOCK')) {
      console.warn(
        `[REDDIT_PROXY] JSON API blocked (${error.message}), switching to HTML scraping fallback...`
      );

      const htmlDiscussions = await scrapeRedditHTML(subreddit, query);
      console.log(
        `[REDDIT_PROXY] HTML scraping fallback found ${htmlDiscussions.length} discussions`
      );

      if (htmlDiscussions.length === 0) {
        throw new Error(
          `Reddit API blocked and HTML fallback returned 0 results`
        );
      }

      discussions = htmlDiscussions;
      rawFetched = htmlDiscussions.length;
    } else {
      throw error;
    }
  }

  return {
    discussions,
    rawFetched,
    afterToken,
    beforeToken,
    isReset,
  };
}

async function checkAlreadyPostedDiscussions(
  supabaseAdmin: any,
  postIds: string[],
  websiteConfigId?: string
): Promise<string[]> {
  if (postIds.length === 0) return [];

  let query = supabaseAdmin
    .from('posted_reddit_discussions')
    .select('reddit_post_id')
    .in('reddit_post_id', postIds);

  if (websiteConfigId) {
    query = query.eq('website_config_id', websiteConfigId);
  }

  const { data, error } = await query;

  if (error) {
    console.error(
      '[REDDIT_PROXY] Error checking posted discussions:',
      error
    );
    return [];
  }

  return data?.map((row: any) => row.reddit_post_id) || [];
}

function getSiteUrl(req: Request): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.VERCEL_URL;

  if (configured) {
    return configured.startsWith('http') ? configured : `https://${configured}`;
  }

  return new URL(req.url).origin;
}

async function triggerSubredditHandoff({
  req,
  query,
  nextSubreddit,
  limit,
  userId,
  websiteConfig,
  configId,
  attemptedSubreddits,
}: {
  req: Request;
  query: string;
  nextSubreddit: string;
  limit: number;
  userId: string;
  websiteConfig: any;
  configId: string;
  attemptedSubreddits: string[];
}) {
  const destination = `${getSiteUrl(req)}/api/reddit/proxy`;
  const body = {
    query,
    subreddit: nextSubreddit,
    limit,
    userId,
    websiteConfig,
    configId,
    attemptedSubreddits,
    handoff: true,
  };
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.CRON_SECRET}`,
  };

  if (process.env.QSTASH_TOKEN) {
    const qstashBaseUrl = process.env.QSTASH_URL || 'https://qstash.upstash.io';
    const publishUrl = `${qstashBaseUrl}/v2/publish/${destination}`;
    const response = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
        'Content-Type': 'application/json',
        'Upstash-Retries': '1',
        'Upstash-Forward-Content-Type': 'application/json',
        'Upstash-Forward-Authorization': `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`QStash handoff failed: ${response.status} ${errorText}`);
    }

    const data = await response.json().catch(() => null);
    console.log(
      `[REDDIT_PROXY] Queued QStash handoff to r/${nextSubreddit}: ${data?.messageId || 'message accepted'}`
    );
    return;
  }

  // Local/dev fallback. QStash should be used in production because serverless
  // runtimes may freeze fire-and-forget work after the response is returned.
  void fetch(destination, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  }).catch((error) => {
    console.error(
      `[REDDIT_PROXY] Fire-and-forget handoff failed for r/${nextSubreddit}:`,
      error
    );
  });
  console.log(
    `[REDDIT_PROXY] Started local fire-and-forget handoff to r/${nextSubreddit}`
  );
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

    const {
      query,
      subreddit,
      limit,
      userId,
      websiteConfig,
      configId,
      attemptedSubreddits: previousAttemptedSubreddits = [],
    } = await req.json();

    if (!query || !subreddit) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // If called from cron job (legacy mode), just return basic discussions without full auto-poster logic
    if (!userId || !websiteConfig) {
      console.log(
        `[REDDIT_PROXY] Legacy mode - fetching basic discussions for r/${subreddit}`
      );

      const discussions = await getRedditDiscussions(
        query,
        subreddit,
        limit || 10
      );

      return NextResponse.json({
        success: true,
        discussions: discussions.items,
        total: discussions.total,
      });
    }

    const decodedCollections = decodeWebsiteConfigCollections(
      websiteConfig?.business_context_terms || []
    );
    const safeWebsiteConfig = {
      ...websiteConfig,
      website_url: websiteConfig?.website_url || '',
      website_description: websiteConfig?.website_description || '',
      target_keywords: websiteConfig?.target_keywords || [],
      negative_keywords: websiteConfig?.negative_keywords || [],
      customer_segments: websiteConfig?.customer_segments || [],
      business_context_terms: decodedCollections.businessContextTerms,
      target_subreddits: getWebsiteConfigSubreddits(websiteConfig),
      relevance_threshold: websiteConfig?.relevance_threshold || 0.7,
    };

    console.log(
      `[REDDIT_PROXY] Starting single-subreddit auto-poster flow for r/${subreddit} with query: ${query}`
    );

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const subredditRotation = getSubredditRotation(safeWebsiteConfig);

    if (subredditRotation.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No subreddits configured' },
        { status: 400 }
      );
    }

    const startingIndex = await getStartingSubredditIndex(
      supabaseAdmin,
      configId,
      subredditRotation,
      subreddit
    );
    const activeSubreddit = subredditRotation[startingIndex];
    const nextIndex = (startingIndex + 1) % subredditRotation.length;
    const nextSubreddit = subredditRotation[nextIndex];
    const normalizedPreviousAttempts = Array.isArray(previousAttemptedSubreddits)
      ? previousAttemptedSubreddits.map(normalizeSubredditName).filter(Boolean)
      : [];

    if (
      normalizedPreviousAttempts.includes(activeSubreddit) &&
      normalizedPreviousAttempts.length >= subredditRotation.length
    ) {
      return NextResponse.json({
        success: true,
        posted: false,
        message: 'Every configured subreddit has already been checked in this run',
        attemptedSubreddits: normalizedPreviousAttempts,
        checkedSubreddits: normalizedPreviousAttempts.length,
      });
    }

    const attemptedSubreddits = Array.from(
      new Set([...normalizedPreviousAttempts, activeSubreddit])
    );
    const checkedEverySubreddit =
      attemptedSubreddits.length >= subredditRotation.length;

    console.log(
      `[REDDIT_PROXY] Searching r/${activeSubreddit}; checked=${attemptedSubreddits.length}/${subredditRotation.length}`
    );

    let response: NextResponse | null = null;
    let payload: any = null;

    try {
      const paginationManager = new RedditPaginationManagerServer(
        userId,
        safeWebsiteConfig.id
      );
      const {
        discussions,
        rawFetched,
        afterToken,
        beforeToken,
        isReset,
      } = await fetchSubredditDiscussions({
        subreddit: activeSubreddit,
        query,
        limit: limit || 10,
        paginationManager,
      });

      response = await processDiscussions(
        discussions,
        userId,
        safeWebsiteConfig,
        configId,
        paginationManager,
        supabaseAdmin,
        activeSubreddit,
        isReset,
        afterToken,
        beforeToken,
        rawFetched,
        attemptedSubreddits
      );

      payload = await response
        .clone()
        .json()
        .catch(() => null);

      if (payload?.posted) {
        return response;
      }

      await updateSubredditRotation(
        supabaseAdmin,
        configId,
        subredditRotation,
        nextIndex,
        `attempt on r/${activeSubreddit}`
      );

      if (!response.ok && response.status >= 500) {
        return response;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      payload = {
        success: false,
        error: message,
        subreddit: activeSubreddit,
      };
      console.error(
        `[REDDIT_PROXY] Attempt failed for r/${activeSubreddit}:`,
        error
      );

      await updateSubredditRotation(
        supabaseAdmin,
        configId,
        subredditRotation,
        nextIndex,
        `failed attempt on r/${activeSubreddit}`
      );
    }

    if (checkedEverySubreddit) {
      return NextResponse.json({
        success: true,
        message:
          'No post was published after checking every configured subreddit once',
        posted: false,
        attemptedSubreddits,
        checkedSubreddits: attemptedSubreddits.length,
        lastResult: payload,
      });
    }

    await triggerSubredditHandoff({
      req,
      query,
      nextSubreddit,
      limit: limit || 10,
      userId,
      websiteConfig: safeWebsiteConfig,
      configId,
      attemptedSubreddits,
    });

    return NextResponse.json({
      success: true,
      posted: false,
      handoff: true,
      message: 'Handed off to next subreddit',
      currentSubreddit: activeSubreddit,
      nextSubreddit,
      attemptedSubreddits,
      checkedSubreddits: attemptedSubreddits.length,
      lastResult: payload,
    });

  } catch (error) {
    console.error('[REDDIT_PROXY] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Helper function to process discussions (filter, score, post) to avoid code duplication between JSON and HTML paths
async function processDiscussions(
  discussions: any[],
  userId: string,
  websiteConfig: any,
  configId: string,
  paginationManager: any,
  supabaseAdmin: any,
  subreddit: string,
  isReset: boolean,
  afterToken: string | null,
  beforeToken: string | null,
  rawFetched: number,
  attemptedSubreddits: string[]
): Promise<NextResponse> {
  // Check if we've already posted to these discussions for this website config.
  // Important: websiteConfig.id is not the same as auto_poster_configs.id.
  const postIds = discussions.map((d: any) => d.id);
  const alreadyPostedIds = await checkAlreadyPostedDiscussions(
    supabaseAdmin,
    postIds,
    websiteConfig.id
  );

  // If all candidates were already posted, advance pagination and let the caller
  // rotate to the next configured subreddit. Do not recurse here; the run is
  // bounded by one pass over configured subreddits.
  if (alreadyPostedIds.length === discussions.length && discussions.length > 0) {
    console.log(
      `[REDDIT_PROXY] All ${discussions.length} candidate posts were already posted for this website config`
    );

    await paginationManager.updatePaginationState(
      subreddit,
      afterToken,
      beforeToken,
      discussions.length,
      isReset
    );

    return NextResponse.json({
      success: true,
      posted: false,
      message: 'All fetched discussions were already posted',
      subreddit,
      discussions: [],
      total: 0,
      rawFetched,
      attemptedSubreddits,
    });
  }

  // Update pagination state after successful fetch.
  if (discussions.length > 0) {
    await paginationManager.updatePaginationState(
      subreddit,
      afterToken,
      beforeToken,
      discussions.length,
      isReset
    );
    console.log(
      `[REDDIT_PROXY] Updated pagination state for r/${subreddit}: candidates=${discussions.length}, rawFetched=${rawFetched}`
    );
  }

  if (!discussions || discussions.length === 0) {
    await paginationManager.updatePaginationState(
      subreddit,
      afterToken,
      beforeToken,
      rawFetched,
      isReset
    );

    return NextResponse.json({
      success: true,
      posted: false,
      message: 'No discussions found',
      subreddit,
      discussions: [],
      total: 0,
      rawFetched,
      attemptedSubreddits,
    });
  }

  // Step 2: Filter out already posted discussions.
  const newDiscussions = discussions.filter(
    (d: any) => !alreadyPostedIds.includes(d.id)
  );
  console.log(
    `[REDDIT_PROXY] Found ${alreadyPostedIds.length} already posted discussions to exclude`
  );
  console.log(
    `[REDDIT_PROXY] ${newDiscussions.length} new discussions to process`
  );

  if (newDiscussions.length === 0) {
    return NextResponse.json({
      success: true,
      posted: false,
      message: 'All discussions already processed',
      subreddit,
      discussions: [],
      total: 0,
      rawFetched,
      attemptedSubreddits,
    });
  }

  // Step 3: Apply relevance filtering with Gemini AI scoring.
  const relevantDiscussions = await filterRelevantDiscussions(
    newDiscussions,
    websiteConfig,
    alreadyPostedIds
  );

  console.log(
    `[REDDIT_PROXY] ${relevantDiscussions.length} discussions passed relevance filtering`
  );

  if (relevantDiscussions.length === 0) {
    return NextResponse.json({
      success: true,
      posted: false,
      message: 'No relevant discussions after filtering',
      subreddit,
      discussions: [],
      total: 0,
      filtered: discussions.length,
      rawFetched,
      attemptedSubreddits,
    });
  }

  // Step 4: Get available Reddit account.
  const { data: availableAccounts } = await supabaseAdmin
    .from('reddit_accounts')
    .select('*')
    .eq('is_validated', true)
    .eq('is_discussion_poster', true)
    .eq('status', 'active')
    .order('last_used_at', { ascending: true, nullsFirst: true });

  // Filter accounts that are actually available (not in cooldown).
  const now = new Date();
  const availableAccountsFiltered =
    availableAccounts?.filter((account: any) => {
      if (account.is_available) return true;

      if (account.current_cooldown_until) {
        return now >= new Date(account.current_cooldown_until);
      }

      if (account.last_used_at) {
        const lastUsed = new Date(account.last_used_at);
        const cooldownMinutes = account.cooldown_minutes || 30;
        const cooldownExpiry = new Date(
          lastUsed.getTime() + cooldownMinutes * 60 * 1000
        );
        return now >= cooldownExpiry;
      }

      return false;
    }) || [];

  const redditAccount = availableAccountsFiltered[0];

  if (!redditAccount) {
    console.error(
      `[REDDIT_PROXY] No Reddit accounts available for posting (Checked ${availableAccounts?.length || 0} accounts)`
    );
    return NextResponse.json(
      {
        success: false,
        error: 'No Reddit accounts available',
        accountStatuses: availableAccounts?.map((a: any) => ({
          username: a.username,
          is_available: a.is_available,
          cooldown_until: a.current_cooldown_until,
          last_used: formatToPacificTime(a.last_used_at),
        })),
      },
      { status: 503 }
    );
  }

  console.log(
    `[REDDIT_PROXY] Using Reddit account: ${redditAccount.username} (Available since ${formatToPacificTime(redditAccount.current_cooldown_until || redditAccount.last_used_at)})`
  );

  // Step 5: Process relevant discussions until one comment succeeds.
  await new Promise((resolve) => setTimeout(resolve, 2000));

  let posted = false;
  let postResult = null;

  for (const { discussion, scores } of relevantDiscussions) {
    console.log(
      `[REDDIT_PROXY] Processing discussion ${discussion.id} (score: ${scores.finalScore})`
    );

    try {
      const result = await redditReplyService.generateAndPostReply(
        {
          id: discussion.id,
          title: discussion.title,
          selftext: discussion.content || '',
          url: discussion.url,
          subreddit: discussion.subreddit,
          score: discussion.score || 0,
          permalink: discussion.url,
        },
        {
          tone: 'pseudo-advice marketing',
          maxLength: 350,
          keywords: websiteConfig.target_keywords || [],
          websiteConfig,
          accountId: redditAccount.id,
          userId: userId,
        }
      );

      if (result.success) {
        console.log(
          `[REDDIT_PROXY] Successfully posted reply to discussion ${discussion.id}`
        );

        const { error: insertError } = await supabaseAdmin
          .from('posted_reddit_discussions')
          .insert({
            website_config_id: websiteConfig.id,
            reddit_post_id: discussion.id,
            reddit_account_id: redditAccount.id,
            subreddit: discussion.subreddit,
            post_title: discussion.title,
            comment_id: result.commentId,
            comment_url: result.commentUrl,
            comment_text: result.generatedReply,
            relevance_score: Math.round(scores.finalScore),
          });

        if (insertError) {
          console.error(
            `[REDDIT_PROXY] [${formatToPacificTime(new Date())}] Database error recording discussion ${discussion.id}:`,
            insertError
          );
        } else {
          console.log(
            `[REDDIT_PROXY] [${formatToPacificTime(new Date())}] Successfully recorded posted discussion ${discussion.id} in database`
          );
        }

        if (configId) {
          const { data: currentConfig } = await supabaseAdmin
            .from('auto_poster_configs')
            .select('current_subreddit_index, posts_today')
            .eq('id', configId)
            .single();

          const subredditRotation = getSubredditRotation(websiteConfig);
          const currentIndex = currentConfig?.current_subreddit_index || 0;
          const nextIndex = (currentIndex + 1) % subredditRotation.length;

          await updateSubredditRotation(
            supabaseAdmin,
            configId,
            subredditRotation,
            nextIndex,
            `successful post on r/${subreddit}`,
            {
              posts_today: (currentConfig?.posts_today || 0) + 1,
              last_posted_at: new Date().toISOString(),
            }
          );
        }

        posted = true;
        postResult = result;
        break;
      }

      console.log(`[REDDIT_PROXY] Failed to post reply: ${result.error}`);
    } catch (error) {
      console.error(
        `[REDDIT_PROXY] Error processing discussion ${discussion.id}:`,
        error
      );
    }
  }

  return NextResponse.json({
    success: true,
    discussions,
    total: discussions.length,
    filtered: discussions.length,
    rawFetched,
    relevant: relevantDiscussions.length,
    posted,
    postResult,
    subreddit,
    attemptedSubreddits,
  });
}
