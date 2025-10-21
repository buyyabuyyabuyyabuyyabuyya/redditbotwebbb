import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRedditDiscussions } from '../../../../lib/redditService';
import { filterRelevantDiscussions } from '../../../../lib/relevanceFiltering';
import { redditReplyService } from '../../../../lib/redditReplyService';


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
      
      const discussions = await getRedditDiscussions(query, subreddit, limit || 25);
      
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

    // Step 1: Fetch Reddit discussions
    const discussions = await getRedditDiscussions(query, subreddit, limit || 25);
    console.log(`[REDDIT_PROXY] Fetched ${discussions.items.length} discussions from r/${subreddit}`);

    if (!discussions.items || discussions.items.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No discussions found',
        discussions: [],
        total: 0
      });
    }

    // Step 2: Get already posted discussions to avoid duplicates
    const { data: postedDiscussions } = await supabaseAdmin
      .from('posted_reddit_discussions')
      .select('reddit_post_id')
      .eq('user_id', userId);
    
    const postedIds = postedDiscussions?.map(p => p.reddit_post_id) || [];
    console.log(`[REDDIT_PROXY] Found ${postedIds.length} already posted discussions to exclude`);

    // Step 3: Apply relevance filtering with Gemini AI scoring
    const relevantDiscussions = await filterRelevantDiscussions(
      discussions.items,
      safeWebsiteConfig,
      postedIds
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
