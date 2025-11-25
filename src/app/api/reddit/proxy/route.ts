import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRedditDiscussions } from '../../../../lib/redditService';
import { filterRelevantDiscussions } from '../../../../lib/relevanceFiltering';
import { redditReplyService } from '../../../../lib/redditReplyService';
import { RedditPaginationManagerServer } from '../../../../lib/redditPaginationServer';


// Main auto-poster endpoint (primary, not backup)
export async function POST(req: Request) {
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

    // Step 1: Fetch Reddit discussions using smart pagination URL
    console.log(`[REDDIT_SERVICE] Fetching from: ${redditUrl}`);
    const response = await fetch(redditUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Reddit API error: ${response.status}`);
    }

    const data = await response.json();
    const afterToken = data.data?.after || null;
    const beforeToken = data.data?.before || null;
    
    // Parse discussions from JSON response
    const discussions = data.data?.children
      ?.filter((post: any) => {
        const title = post.data.title.toLowerCase();
        const content = (post.data.selftext || '').toLowerCase();
        const queryLower = query.toLowerCase();
        return title.includes(queryLower) || content.includes(queryLower);
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
    
    console.log(`[REDDIT_PROXY] Fetched ${discussions.length} discussions from r/${subreddit}`);
    
    // Check if we've already posted to these discussions
    const postIds = discussions.map((d: any) => d.id);
    const alreadyPostedIds = await paginationManager.checkAlreadyPosted(postIds);
    
    // If ALL posts on this page are already processed, skip to next page
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
        afterToken,
        beforeToken,
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
      safeWebsiteConfig,
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
        filtered: discussions.items.length
      });
    }

    // Step 4: Get available Reddit account
    const { data: availableAccounts } = await supabaseAdmin
      .from('reddit_accounts')
      .select('*')
      .eq('is_validated', true)
      .eq('is_discussion_poster', true)
      .eq('status', 'active')
      .eq('is_available', true)
      .order('last_used_at', { ascending: true, nullsFirst: true })
      .limit(1);

    const redditAccount = availableAccounts?.[0];

    if (!redditAccount) {
      console.error(`[REDDIT_PROXY] No Reddit accounts available for posting`);
      return NextResponse.json({
        success: false,
        error: 'No Reddit accounts available'
      }, { status: 503 });
    }

    console.log(`[REDDIT_PROXY] Using Reddit account: ${redditAccount.username}`);

    // Step 5: Process discussions with Gemini AI and post replies
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
            keywords: safeWebsiteConfig.target_keywords || [],
            accountId: redditAccount.id,
            userId: userId
          }
        );

        if (result.success) {
          console.log(`[REDDIT_PROXY] Successfully posted reply to discussion ${discussion.id}`);
          
          // Record the posted discussion
          await supabaseAdmin
            .from('posted_reddit_discussions')
            .insert({
              user_id: userId,
              reddit_post_id: discussion.id,
              reddit_account_id: redditAccount.id,
              subreddit: discussion.subreddit,
              post_title: discussion.title,
              post_url: discussion.url,
              reply_content: result.generatedReply,
              relevance_score: scores.finalScore
            });

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
      discussions: discussions.items,
      total: discussions.total,
      filtered: discussions.items.length,
      relevant: relevantDiscussions.length,
      posted: posted,
      postResult: postResult
    });

  } catch (error) {
    console.error('[REDDIT_PROXY] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
