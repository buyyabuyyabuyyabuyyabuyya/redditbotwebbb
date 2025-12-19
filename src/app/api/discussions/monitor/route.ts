import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { callGroqForText } from '../../../../utils/groqTextGeneration';
import snoowrap from 'snoowrap';

const createSupabaseServerClient = () => {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
};

export async function POST(req: Request) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const { product_id, subreddits, keywords = [] } = await req.json();

    if (!product_id || !subreddits || !Array.isArray(subreddits)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`Starting discussion monitoring for product: ${product_id}`);

    const supabase = createSupabaseServerClient();

    // Get product details
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .eq('user_id', userId)
      .single();

    if (productError || !product) {
      throw new Error('Product not found or access denied');
    }

    // Get user plan and message count
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('subscription_status, message_count')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      throw new Error('Failed to fetch user plan information');
    }

    // Check plan limits before proceeding
    if (userData.subscription_status === 'pro' && userData.message_count >= 200) {
      throw new Error('Pro plan message limit reached (200 messages/month). Please upgrade to Advanced for unlimited messages.');
    }

    if (userData.subscription_status === 'free' && userData.message_count >= 15) {
      throw new Error('Free plan message limit reached (15 messages/month). Please upgrade to Pro or Advanced for more messages.');
    }

    // Get discussion posting accounts
    const { data: discussionAccounts, error: accountsError } = await supabase
      .from('reddit_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_discussion_poster', true)
      .eq('is_validated', true);

    if (accountsError) {
      throw new Error('Failed to fetch discussion accounts');
    }

    if (!discussionAccounts || discussionAccounts.length === 0) {
      throw new Error('No discussion posting accounts found. Please add Reddit accounts for discussion posting.');
    }

    let totalDiscussionsFound = 0;
    const discussions = [];

    // Monitor each subreddit
    for (const subreddit of subreddits.slice(0, 10)) { // Limit to 10 subreddits per request
      try {
        console.log(`Monitoring subreddit: r/${subreddit}`);

        // Create Reddit client (you'll need to configure this with your Reddit API credentials)
        const reddit = new snoowrap({
          userAgent: 'RedditOutreach/1.0 (Discussion Monitor)',
          clientId: process.env.REDDIT_CLIENT_ID,
          clientSecret: process.env.REDDIT_CLIENT_SECRET,
          refreshToken: process.env.REDDIT_REFRESH_TOKEN,
        });

        // Get recent posts from subreddit
        const posts = await reddit.getSubreddit(subreddit).getNew({ limit: 50 });

        for (const post of posts) {
          try {
            // Skip posts that are too old or already processed
            const postAge = Date.now() - post.created_utc * 1000;
            if (postAge > 24 * 60 * 60 * 1000) { // Skip posts older than 24 hours
              continue;
            }

            // Check if we already have this discussion
            const { data: existingDiscussion } = await supabase
              .from('discussions')
              .select('id')
              .eq('product_id', product_id)
              .eq('post_id', post.id)
              .single();

            if (existingDiscussion) {
              continue; // Already processed
            }

            // AI relevance scoring
            const relevanceScore = await scorePostRelevance(post, product, keywords);

            // Only process posts with relevance score >= 6
            if (relevanceScore >= 6) {
              const discussion = {
                product_id,
                subreddit,
                post_id: post.id,
                title: post.title,
                content: post.selftext || '',
                author: post.author.name,
                relevance_score: relevanceScore,
                status: 'pending',
                post_url: `https://reddit.com${post.permalink}`,
                post_created_at: new Date(post.created_utc * 1000).toISOString()
              };

              // Insert discussion into database
              const { data: insertedDiscussion, error: insertError } = await supabase
                .from('discussions')
                .insert(discussion)
                .select()
                .single();

              if (insertError) {
                console.error(`Error inserting discussion: ${insertError.message}`);
                continue;
              }

              discussions.push(insertedDiscussion);
              totalDiscussionsFound++;

              // Log the found discussion
              console.log(`Found relevant discussion: ${post.title} (Score: ${relevanceScore})`);

              // Schedule reply generation and posting using Upstash QStash (3.20 min delay)
              try {
                // Select a random discussion posting account for rotation
                const randomAccount = discussionAccounts[Math.floor(Math.random() * discussionAccounts.length)];

                // Generate AI reply content
                const aiReplyPrompt = `You are an expert at providing helpful, non-promotional responses to Reddit discussions.

PRODUCT DESCRIPTION:
${product.ai_description}

CUSTOMER SEGMENTS:
${product.customer_segments?.join('\n') || 'Not specified'}

REDDIT POST:
Title: ${post.title}
Content: ${post.selftext || 'No content'}

TASK: Generate a helpful, genuine response that provides value to this discussion. Your response should:
- Be genuinely helpful and relevant to the post
- NOT be promotional or spammy
- Show expertise and knowledge
- Naturally mention your product only if it's genuinely relevant
- Be conversational and Reddit-appropriate

Return only the response text, no additional formatting:`;

                const aiReplyResponse = await callGroqForText(aiReplyPrompt, { userId: 'system' });

                if (aiReplyResponse && aiReplyResponse.text && !aiReplyResponse.error) {
                  const replyContent = aiReplyResponse.text.trim();

                  // Schedule the reply posting with 3.20 minute delay using Upstash QStash
                  const { scheduleQStashMessage } = await import('../../../../utils/qstash');

                  await scheduleQStashMessage({
                    destination: '/api/discussions/post-reply',
                    body: {
                      discussion_id: insertedDiscussion.id,
                      account_id: randomAccount.id,
                      reply_content: replyContent
                    },
                    delaySeconds: 3.2 * 60, // 3.20 minutes (same as your existing system)
                    retries: 2
                  });

                  console.log(`Scheduled reply posting for discussion ${insertedDiscussion.id} with 3.20 min delay`);
                } else {
                  console.error('Failed to generate AI reply content');
                }
              } catch (qstashError) {
                console.error('Error scheduling reply via QStash:', qstashError);
                // Continue processing other discussions even if QStash fails
              }
            }

          } catch (postError) {
            console.error(`Error processing post ${post.id}:`, postError);
            continue;
          }
        }

      } catch (subredditError) {
        console.error(`Error monitoring subreddit r/${subreddit}:`, subredditError);
        continue;
      }
    }

    console.log(`Monitoring complete. Found ${totalDiscussionsFound} relevant discussions`);

    const response = {
      success: true,
      discussions_found: totalDiscussionsFound,
      discussions: discussions,
      message: `Successfully monitored ${subreddits.length} subreddits and found ${totalDiscussionsFound} relevant discussions`
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Discussion monitoring error:', error);

    const response = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };

    return NextResponse.json(response, { status: 500 });
  }
}

// AI-powered relevance scoring
async function scorePostRelevance(post: any, product: any, keywords: string[]): Promise<number> {
  try {
    const aiPrompt = `You are an expert at determining the relevance of Reddit posts to specific products/services.

PRODUCT DESCRIPTION:
${product.ai_description}

CUSTOMER SEGMENTS:
${product.customer_segments?.join('\n') || 'Not specified'}

KEYWORDS:
${keywords.join(', ')}

REDDIT POST:
Title: ${post.title}
Content: ${post.selftext || 'No content'}

TASK: Rate the relevance of this Reddit post to the product on a scale of 1-10.

SCORING CRITERIA:
- 1-3: Not relevant at all
- 4-5: Somewhat relevant, but not a good fit
- 6-7: Relevant, good opportunity for helpful input
- 8-9: Highly relevant, excellent opportunity
- 10: Perfect match, ideal opportunity

Consider:
- Does the post discuss problems your product solves?
- Are the customer segments likely to be reading this post?
- Is this a genuine discussion (not promotional)?
- Would your product provide genuine value to this conversation?

Return only a number between 1-10:`;

    const aiResponse = await callGroqForText(aiPrompt, { userId: 'system' });

    if (!aiResponse || aiResponse.error) {
      return 3; // Default low score if AI fails
    }

    const score = parseInt(aiResponse.text.trim());

    if (isNaN(score) || score < 1 || score > 10) {
      return 3; // Default score if AI returns invalid response
    }

    return score;

  } catch (error) {
    console.error('Error scoring post relevance:', error);
    return 3; // Default low score on error
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Discussion monitoring service is running',
    timestamp: new Date().toISOString()
  });
}