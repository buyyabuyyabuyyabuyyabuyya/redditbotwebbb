import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRedditDiscussions } from '../../../../lib/redditService';
import { filterRelevantDiscussions } from '../../../../lib/relevanceFiltering';

// Endpoint to fetch relevant discussions for UI display
export async function POST(req: Request) {
  try {
    const { userId, configId, preview = true } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Initialize Supabase
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Get user's auto-poster config
    const { data: config } = await supabaseAdmin
      .from('auto_poster_configs')
      .select(`
        *,
        website_configs (
          website_url,
          website_description,
          target_keywords,
          negative_keywords,
          customer_segments,
          relevance_threshold
        )
      `)
      .eq('user_id', userId)
      .eq('id', configId || 0)
      .single();

    if (!config || !config.website_configs) {
      return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
    }

    const websiteConfig = config.website_configs;
    const subreddits = config.target_subreddits || ['SaaS', 'entrepreneur', 'startups'];

    // Get already posted discussions to exclude
    const { data: postedDiscussions } = await supabaseAdmin
      .from('posted_reddit_discussions')
      .select('reddit_post_id')
      .eq('user_id', userId);
    
    const postedIds = postedDiscussions?.map(p => p.reddit_post_id) || [];

    // Fetch discussions from multiple subreddits
    const allRelevantDiscussions = [];
    
    for (const subreddit of subreddits.slice(0, 3)) { // Limit to 3 subreddits for UI
      try {
        console.log(`[DISCUSSIONS_API] Fetching from r/${subreddit}`);
        
        const discussions = await getRedditDiscussions('', subreddit, 10);
        
        if (discussions.items && discussions.items.length > 0) {
          // Apply Gemini AI relevance filtering
          const relevantDiscussions = await filterRelevantDiscussions(
            discussions.items,
            websiteConfig,
            postedIds
          );

          // Add subreddit info and limit results
          const subredditDiscussions = relevantDiscussions.slice(0, 5).map(item => ({
            ...item,
            subreddit: subreddit
          }));

          allRelevantDiscussions.push(...subredditDiscussions);
        }
      } catch (error) {
        console.error(`[DISCUSSIONS_API] Error fetching from r/${subreddit}:`, error);
      }
    }

    // Sort by relevance score and limit total results
    const sortedDiscussions = allRelevantDiscussions
      .sort((a, b) => b.scores.finalScore - a.scores.finalScore)
      .slice(0, 15); // Show top 15 most relevant

    // Format for UI display
    const formattedDiscussions = sortedDiscussions.map(item => ({
      id: item.discussion.id,
      title: item.discussion.title,
      content: item.discussion.content?.substring(0, 300) + (item.discussion.content?.length > 300 ? '...' : ''),
      url: item.discussion.url,
      subreddit: item.discussion.subreddit,
      score: item.discussion.score,
      num_comments: item.discussion.num_comments,
      created_utc: item.discussion.created_utc,
      relevance_scores: {
        final_score: item.scores.finalScore,
        intent_score: item.scores.intentScore,
        context_match_score: item.scores.contextMatchScore,
        quality_score: item.scores.qualityScore,
        engagement_score: item.scores.engagementScore,
        filtering_reason: item.scores.filteringReason
      },
      is_posted: postedIds.includes(item.discussion.id)
    }));

    return NextResponse.json({
      success: true,
      discussions: formattedDiscussions,
      total: formattedDiscussions.length,
      config: {
        relevance_threshold: websiteConfig.relevance_threshold,
        target_keywords: websiteConfig.target_keywords,
        negative_keywords: websiteConfig.negative_keywords
      }
    });

  } catch (error) {
    console.error('[DISCUSSIONS_API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
