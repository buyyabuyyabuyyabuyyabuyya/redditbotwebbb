import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { AccountCooldownManager } from '../../../../lib/accountCooldownManager';
import { RedditService } from '../../../../lib/redditService';
import { RelevanceFiltering } from '../../../../lib/relevanceFiltering';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all running auto-posters for this user
    const { data: runningPosters, error: postersError } = await supabaseAdmin
      .from('auto_poster_status')
      .select(`
        *,
        website_configs!inner(*)
      `)
      .eq('user_id', userId)
      .eq('is_running', true);

    if (postersError) {
      console.error('Error fetching running auto-posters:', postersError);
      return NextResponse.json({ error: 'Failed to fetch auto-posters' }, { status: 500 });
    }

    if (!runningPosters || runningPosters.length === 0) {
      return NextResponse.json({ message: 'No running auto-posters found' });
    }

    const results = [];

    for (const poster of runningPosters) {
      const config = poster.website_configs;
      const now = new Date();
      const nextPostTime = poster.next_post_time ? new Date(poster.next_post_time) : null;
      
      // Check if it's time to post (immediate post or scheduled time)
      const shouldPost = poster.should_post_immediately || (nextPostTime && now >= nextPostTime);
      
      if (!shouldPost) {
        continue;
      }

      try {
        // Get available Reddit account
        const cooldownManager = new AccountCooldownManager();
        const account = await cooldownManager.getNextAvailableAccount();
        
        if (!account) {
          await supabaseAdmin
            .from('auto_poster_status')
            .update({
              last_post_result: '❌ No Reddit accounts available',
              next_post_time: new Date(now.getTime() + 30 * 60 * 1000).toISOString()
            })
            .eq('id', poster.id);
          continue;
        }

        // Search for relevant discussions
        const redditService = new RedditService();
        const relevanceFiltering = new RelevanceFiltering();
        
        const searchQuery = config.target_keywords?.join(' OR ') || config.customer_segments?.join(' OR ') || '';
        const discussions = await redditService.searchDiscussions(searchQuery, 10);
        
        if (!discussions || discussions.length === 0) {
          await supabaseAdmin
            .from('auto_poster_status')
            .update({
              last_post_result: '❌ No relevant discussions found',
              next_post_time: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
              should_post_immediately: false
            })
            .eq('id', poster.id);
          continue;
        }

        // Filter discussions for relevance
        const relevantDiscussions = discussions.filter(discussion => {
          const scores = relevanceFiltering.calculateRelevanceScores(discussion, config);
          return scores.finalScore >= (config.relevance_threshold || 70);
        });

        if (relevantDiscussions.length === 0) {
          await supabaseAdmin
            .from('auto_poster_status')
            .update({
              last_post_result: '❌ No discussions met relevance threshold',
              next_post_time: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
              should_post_immediately: false
            })
            .eq('id', poster.id);
          continue;
        }

        // Check for duplicates
        const targetDiscussion = relevantDiscussions[0];
        const { data: existingPost } = await supabaseAdmin
          .from('posted_reddit_discussions')
          .select('id')
          .eq('reddit_post_id', targetDiscussion.id)
          .single();

        if (existingPost) {
          await supabaseAdmin
            .from('auto_poster_status')
            .update({
              last_post_result: '❌ Discussion already posted to',
              next_post_time: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
              should_post_immediately: false
            })
            .eq('id', poster.id);
          continue;
        }

        // Generate and post comment
        const commentResult = await redditService.postComment(
          account,
          targetDiscussion,
          config
        );

        if (commentResult.success) {
          // Mark account as used
          await cooldownManager.markAccountAsUsed(account.id);
          
          // Record the post
          await supabaseAdmin
            .from('posted_reddit_discussions')
            .insert({
              reddit_post_id: targetDiscussion.id,
              reddit_account_id: account.id,
              comment_text: commentResult.comment,
              subreddit: targetDiscussion.subreddit,
              post_title: targetDiscussion.title,
              post_url: targetDiscussion.url,
              relevance_score: relevanceFiltering.calculateRelevanceScores(targetDiscussion, config).finalScore,
              status: 'posted'
            });

          await supabaseAdmin
            .from('auto_poster_status')
            .update({
              last_post_result: `✅ Posted to r/${targetDiscussion.subreddit}`,
              next_post_time: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
              posts_today: (poster.posts_today || 0) + 1,
              should_post_immediately: false
            })
            .eq('id', poster.id);

          results.push({
            websiteConfigId: config.id,
            success: true,
            message: `Posted to r/${targetDiscussion.subreddit}`,
            discussionTitle: targetDiscussion.title
          });
        } else {
          await supabaseAdmin
            .from('auto_poster_status')
            .update({
              last_post_result: `❌ ${commentResult.error || 'Failed to post comment'}`,
              next_post_time: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
              should_post_immediately: false
            })
            .eq('id', poster.id);

          results.push({
            websiteConfigId: config.id,
            success: false,
            message: commentResult.error || 'Failed to post comment'
          });
        }

      } catch (error) {
        console.error(`Error processing auto-poster for config ${config.id}:`, error);
        
        await supabaseAdmin
          .from('auto_poster_status')
          .update({
            last_post_result: '❌ Processing error occurred',
            next_post_time: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
            should_post_immediately: false
          })
          .eq('id', poster.id);

        results.push({
          websiteConfigId: config.id,
          success: false,
          message: 'Processing error occurred'
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: results.length,
      results 
    });

  } catch (error) {
    console.error('Error processing auto-posters:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
