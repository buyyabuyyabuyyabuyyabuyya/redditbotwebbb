import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { BUSINESS_SUBREDDITS, searchMultipleSubredditsWithPagination } from '../../../../lib/redditService';
import { filterRelevantDiscussions } from '../../../../lib/relevanceFiltering';
import { redditReplyService } from '../../../../lib/redditReplyService';
import { AccountCooldownManager } from '../../../../lib/accountCooldownManager';

// Cron job endpoint for automated posting
export async function POST(req: Request) {
  try {
    // Verify cron secret from headers (Upstash sends it this way)
    const authHeader = req.headers.get('Authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    console.log('[CRON] Auth check - received:', authHeader ? `Bearer ${authHeader.substring(7, 17)}...` : 'none');
    console.log('[CRON] Expected:', expectedAuth ? `Bearer ${expectedAuth.substring(7, 17)}...` : 'none');
    
    if (authHeader !== expectedAuth) {
      console.error('[CRON] Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[CRON] Starting auto-poster job...');

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Reset daily counters if needed
    await supabaseAdmin.rpc('reset_daily_post_counts');

    // Get configs that are ready to post
    const { data: readyConfigs, error: configError } = await supabaseAdmin
      .from('auto_poster_configs')
      .select('*')
      .eq('enabled', true)
      .eq('status', 'active')
      .or('next_post_at.is.null,next_post_at.lt.' + new Date().toISOString())
      .filter('posts_today', 'lt', 'max_posts_per_day');

    if (configError) {
      console.error('[CRON] Error fetching configs:', configError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    console.log(`[CRON] Found ${readyConfigs?.length || 0} configs ready to post`);

    let totalPosts = 0;
    let totalErrors = 0;

    // Process each config
    for (const config of readyConfigs || []) {
      try {
        console.log(`[CRON] Processing config ${config.id} for product ${config.product_id}`);

        // Get website config details
        const { data: websiteConfig } = await supabaseAdmin
          .from('website_configs')
          .select('*')
          .eq('id', config.product_id)
          .single();

        if (!websiteConfig) {
          console.error(`[CRON] Website config not found for ${config.product_id}`);
          totalErrors++;
          continue;
        }

        // Get current subreddit rotation index
        const currentIndex = config.current_subreddit_index || 0;
        const targetSubreddit = BUSINESS_SUBREDDITS[currentIndex % BUSINESS_SUBREDDITS.length];
        
        console.log(`[CRON] Using subreddit: r/${targetSubreddit} (index ${currentIndex})`);

        // Use AccountCooldownManager to get next available account with rotation
        const cooldownManager = new AccountCooldownManager();
        const redditAccount = await cooldownManager.getNextAvailableAccount();

        if (!redditAccount) {
          const waitTime = await cooldownManager.getEstimatedWaitTime();
          console.error(`[CRON] No Reddit accounts available for posting. Wait time: ${waitTime} minutes`);
          totalErrors++;
          continue;
        }

        console.log(`[CRON] Using Reddit account: ${redditAccount.username} (ID: ${redditAccount.id})`);

        // Use redditService for multi-subreddit fetching
        const query = websiteConfig.target_keywords?.join(' ') || websiteConfig.customer_segments?.join(' ') || 'business';
        
        console.log(`[CRON] Fetching hot posts from r/${targetSubreddit} with query: ${query}`);
        
        const discussions = await searchMultipleSubredditsWithPagination(
          query,
          config.user_id,
          [targetSubreddit], // Focus on one subreddit per cycle
          25,
          websiteConfig,
          false // Disable pagination for cron job
        );
        
        if (!discussions || discussions.length === 0) {
          console.log(`[CRON] No discussions found in r/${targetSubreddit} for config ${config.id}`);
          
          continue;
        }
        
        console.log(`[CRON] Found ${discussions.length} discussions in r/${targetSubreddit}`);
        
        // Get already posted discussions to avoid duplicates
        const { data: postedDiscussions } = await supabaseAdmin
          .from('posted_reddit_discussions')
          .select('reddit_post_id')
          .eq('user_id', config.user_id);
        
        const postedIds = postedDiscussions?.map(p => p.reddit_post_id) || [];
        
        // Use relevance filtering for advanced scoring
        const relevantDiscussions = filterRelevantDiscussions(
          discussions,
          websiteConfig,
          postedIds
        );
        
        console.log(`[CRON] ${relevantDiscussions.length} discussions passed relevance filtering`);
        
        if (relevantDiscussions.length === 0) {
          console.log(`[CRON] No relevant discussions after filtering for config ${config.id}`);
          continue;
        }

        // Process discussions with Gemini AI integration
        let posted = false;
        for (const { discussion, scores } of relevantDiscussions) {
          console.log(`[CRON] Processing discussion ${discussion.id} (score: ${scores.finalScore})`);
          
          try {
            // Use redditReplyService for Gemini-powered reply generation and posting
            const result = await redditReplyService.generateAndPostReply(
              {
                id: discussion.id,
                title: discussion.title,
                selftext: discussion.content || '',
                subreddit: discussion.subreddit,
                score: discussion.score || 0,
                url: discussion.url,
                permalink: discussion.url.replace('https://reddit.com', '')
              },
              {
                tone: 'helpful',
                maxLength: 400,
                keywords: websiteConfig.target_keywords || [],
                accountId: redditAccount.id,
                userId: config.user_id
              }
            );

            if (result.success) {
              console.log(`[CRON] Successfully posted AI-generated comment to ${discussion.id}`);
              console.log(`[CRON] Comment confidence: ${result.confidence}`);
              console.log(`[CRON] Comment URL: ${result.commentUrl}`);
              console.log(`[CRON] Account ${redditAccount.username} will be available again in 30 minutes`);
              
              // Mark account as used (starts 30min cooldown)
              await cooldownManager.markAccountAsUsed(redditAccount.id);
              
              // Store posted discussion with relevance scores and account info
              await supabaseAdmin.from('posted_reddit_discussions').insert({
                reddit_post_id: discussion.id,
                reddit_post_title: discussion.title,
                reddit_post_url: discussion.url,
                subreddit: discussion.subreddit,
                user_id: config.user_id,
                relevance_score: scores.finalScore,
                intent_score: scores.intentScore,
                context_match_score: scores.contextMatchScore,
                quality_score: scores.qualityScore,
                engagement_score: scores.engagementScore,
                ai_confidence: result.confidence,
                comment_text: result.generatedReply,
                reddit_account_id: redditAccount.id,
                reddit_account_username: redditAccount.username
              });
              
              totalPosts++;
              posted = true;
              break; // Only post to one discussion per config per run
            } else if (result.skipped) {
              console.log(`[CRON] Skipped discussion ${discussion.id}: ${result.reason}`);
              continue;
            } else {
              console.error(`[CRON] Failed to post to ${discussion.id}: ${result.error}`);
              totalErrors++;
              continue;
            }
          } catch (error) {
            console.error(`[CRON] Error processing discussion ${discussion.id}:`, error);
            totalErrors++;
            continue;
          }
        }

        if (!posted) {
          console.log(`[CRON] No posts made for config ${config.id} in r/${targetSubreddit}`);
        } else {
          console.log(`[CRON] Successfully posted for config ${config.id} in r/${targetSubreddit}`);
        }

        // Update config's next post time, stats, and subreddit rotation
        await supabaseAdmin
          .from('auto_poster_configs')
          .update({
            last_posted_at: posted ? new Date().toISOString() : config.last_posted_at,
            next_post_at: new Date(Date.now() + config.interval_minutes * 60 * 1000).toISOString(),
            posts_today: posted ? (config.posts_today || 0) + 1 : config.posts_today,
            current_subreddit_index: (currentIndex + 1) % BUSINESS_SUBREDDITS.length,
            last_subreddit_used: targetSubreddit
          })
          .eq('id', config.id);

      } catch (error) {
        totalErrors++;
        console.error(`[CRON] Error processing config ${config.id}:`, error);
      }

      // Rate limiting between configs
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
    }

    // Update worker status - first get current values
    const { data: currentStatus } = await supabaseAdmin
      .from('background_worker_status')
      .select('total_runs, successful_runs, failed_runs')
      .eq('worker_type', 'posting')
      .single();

    await supabaseAdmin
      .from('background_worker_status')
      .upsert({
        worker_type: 'posting',
        status: 'idle',
        last_run_at: new Date().toISOString(),
        next_run_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes from now
        total_runs: (currentStatus?.total_runs || 0) + 1,
        successful_runs: totalErrors === 0 ? (currentStatus?.successful_runs || 0) + 1 : (currentStatus?.successful_runs || 0),
        failed_runs: totalErrors > 0 ? (currentStatus?.failed_runs || 0) + 1 : (currentStatus?.failed_runs || 0),
        current_run_posts_made: totalPosts
      });

    console.log(`[CRON] Auto-poster job completed. Posts: ${totalPosts}, Errors: ${totalErrors}`);

    return NextResponse.json({
      success: true,
      message: `Auto-poster job completed`,
      stats: {
        configsProcessed: readyConfigs?.length || 0,
        totalPosts,
        totalErrors
      }
    });

  } catch (error) {
    console.error('[CRON] Auto-poster job failed:', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}

// Health check endpoint
export async function GET(req: Request) {
  return NextResponse.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString() 
  });
}
