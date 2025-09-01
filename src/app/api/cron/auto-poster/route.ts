import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Cron job endpoint for automated posting
export async function GET(req: Request) {
  try {
    // Verify cron secret to prevent unauthorized access
    const { searchParams } = new URL(req.url);
    const cronSecret = searchParams.get('secret');
    
    if (cronSecret !== process.env.CRON_SECRET) {
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

        // Get available Reddit account
        const { data: redditAccount } = await supabaseAdmin
          .from('reddit_accounts')
          .select('*')
          .eq('id', config.account_id)
          .eq('is_discussion_poster', true)
          .eq('is_validated', true)
          .single();

        if (!redditAccount) {
          console.error(`[CRON] Reddit account not found or not enabled for posting`);
          totalErrors++;
          continue;
        }

        // Search for relevant discussions using Reddit hot posts
        const query = websiteConfig.target_keywords?.join(' ') || websiteConfig.customer_segments?.join(' ') || 'business';
        const redditUrl = `https://old.reddit.com/r/entrepreneur/hot.json?limit=25`;
        
        const searchResponse = await fetch(redditUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        
        if (!searchResponse.ok) {
          console.error(`[CRON] Failed to search Reddit discussions`);
          totalErrors++;
          continue;
        }

        const redditData = await searchResponse.json();
        
        // Transform Reddit data to match expected format and filter by query
        const discussions = redditData.data?.children
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
            raw_comment: post.data.selftext || post.data.title
          })) || [];
        
        if (!discussions || discussions.length === 0) {
          console.log(`[CRON] No relevant discussions found for config ${config.id}`);
          continue;
        }

        // Filter for relevance and check for duplicates
        let posted = false;
        for (const discussion of discussions) {
          // Check if we've already posted to this discussion
          const { data: existingPost } = await supabaseAdmin
            .from('posted_reddit_discussions')
            .select('id')
            .eq('reddit_post_id', discussion.id)
            .single();

          if (existingPost) {
            console.log(`[CRON] Already posted to discussion ${discussion.id}, skipping`);
            continue;
          }

          // Post comment using Reddit API
          const commentResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/reddit/post-comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              postId: discussion.id,
              accountId: redditAccount.id,
              websiteConfig: websiteConfig,
              discussion: discussion
            })
          });

          if (commentResponse.ok) {
            const commentResult = await commentResponse.json();
            
            // Log the successful post
            await supabaseAdmin
              .from('auto_posting_logs')
              .insert({
                config_id: config.id,
                user_id: websiteConfig.user_id,
                beno_reply_id: `auto_${Date.now()}`,
                product_id: config.product_id,
                account_id: redditAccount.id,
                subreddit: discussion.subreddit,
                post_id: discussion.id,
                comment_id: commentResult.commentId,
                comment_url: commentResult.commentUrl,
                reply_text: commentResult.comment,
                relevance_score: 85, // Default score for auto-posts
                validation_score: 80,
                status: 'posted',
                posted_at: new Date().toISOString()
              });

            // Record in posted_reddit_discussions for duplicate prevention
            await supabaseAdmin
              .from('posted_reddit_discussions')
              .insert({
                reddit_post_id: discussion.id,
                reddit_account_id: redditAccount.id,
                comment_text: commentResult.comment,
                subreddit: discussion.subreddit,
                post_title: discussion.title,
                post_url: discussion.url,
                relevance_score: 85,
                status: 'posted'
              });

            totalPosts++;
            posted = true;
            console.log(`[CRON] Successfully posted to r/${discussion.subreddit}: ${discussion.title}`);
            break; // Only post once per config per run
          } else {
            console.error(`[CRON] Failed to post comment:`, await commentResponse.text());
          }
        }

        if (!posted) {
          console.log(`[CRON] No suitable discussions found for posting for config ${config.id}`);
        }

        // Update config's next post time and stats
        await supabaseAdmin
          .from('auto_poster_configs')
          .update({
            last_posted_at: posted ? new Date().toISOString() : config.last_posted_at,
            next_post_at: new Date(Date.now() + config.interval_minutes * 60 * 1000).toISOString(),
            posts_today: posted ? (config.posts_today || 0) + 1 : config.posts_today
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
export async function POST(req: Request) {
  return NextResponse.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString() 
  });
}
