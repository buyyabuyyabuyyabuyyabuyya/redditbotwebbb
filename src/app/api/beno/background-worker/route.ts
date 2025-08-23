import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const BENO_AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb2xsZWN0aW9uSWQiOiJtaTJ4bm5oYjkyNWpmNGYiLCJleHAiOjE4MTkwMzM1MTksImlkIjoiaDIxdGRmM25oazg2d3dvIiwidHlwZSI6ImF1dGhSZWNvcmQifQ.e2Wz4BnFXi8VJm7RcTkoyq74Du-gpHaFZ72xdWz9TZk';
const PB_BASE = 'https://app.beno.one/pbsb/api';

// Background worker that runs continuously
export async function POST(req: Request) {
  try {
    const { action } = await req.json();

    switch (action) {
      case 'discover_and_generate':
        return await discoverAndGenerateReplies();
      case 'auto_post':
        return await autoPostReplies();
      case 'status':
        return await getWorkerStatus();
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Background worker error:', error);
    return NextResponse.json({ error: 'Worker error' }, { status: 500 });
  }
}

// Discover new posts and generate replies
async function discoverAndGenerateReplies() {
  try {
    console.log('[Worker] Starting post discovery and reply generation...');

    // 1. Get all active products
    const productsRes = await fetch(`${PB_BASE}/collections/beno_promoting_products/records`, {
      headers: { 'Authorization': BENO_AUTH_TOKEN }
    });
    
    if (!productsRes.ok) {
      throw new Error(`Failed to fetch products: ${productsRes.status}`);
    }

    const productsData = await productsRes.json();
    const activeProducts = productsData.items?.filter((p: any) => p.status === 'active') || [];

    console.log(`[Worker] Found ${activeProducts.length} active products`);

    let totalNewReplies = 0;

    // 2. For each product, trigger Beno's discovery process
    for (const product of activeProducts) {
      try {
        console.log(`[Worker] Processing product: ${product.name}`);

        // Trigger Beno's post discovery (similar to CustomerFinding flow)
        const discoverRes = await fetch(`${PB_BASE}/collections/beno_raw_comments/records`, {
          method: 'POST',
          headers: {
            'Authorization': BENO_AUTH_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            product_id: product.id,
            auto_discovery: true,
            last_scan: new Date().toISOString()
          })
        });

        // Trigger reply generation
        const repliesRes = await fetch('/api/beno/replies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: product.id })
        });

        if (repliesRes.ok) {
          const repliesData = await repliesRes.json();
          totalNewReplies += repliesData.newReplies || 0;
          console.log(`[Worker] Generated ${repliesData.newReplies || 0} new replies for ${product.name}`);
        }

      } catch (error) {
        console.error(`[Worker] Error processing product ${product.name}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Discovery complete. Generated ${totalNewReplies} new replies across ${activeProducts.length} products.`,
      stats: {
        productsProcessed: activeProducts.length,
        newRepliesGenerated: totalNewReplies
      }
    });

  } catch (error) {
    console.error('[Worker] Discovery error:', error);
    return NextResponse.json({ error: 'Discovery failed' }, { status: 500 });
  }
}

// Auto-post ready replies
async function autoPostReplies() {
  try {
    console.log('[Worker] Starting auto-posting...');

    // Get all ready-to-post replies with high scores
    const filter = encodeURIComponent(
      `status="validation_passed" && relevance_score>=80 && validation_score>=75`
    );
    
    const repliesRes = await fetch(
      `${PB_BASE}/collections/beno_replies/records?filter=${filter}&expand=reply_to,reply_to.subs_source&perPage=50&sort=-relevance_score`,
      {
        headers: { 'Authorization': BENO_AUTH_TOKEN }
      }
    );

    if (!repliesRes.ok) {
      throw new Error(`Failed to fetch replies: ${repliesRes.status}`);
    }

    const repliesData = await repliesRes.json();
    const readyReplies = repliesData.items || [];

    console.log(`[Worker] Found ${readyReplies.length} high-quality replies ready to post`);

    let successfulPosts = 0;
    let failedPosts = 0;

    // Post replies with rate limiting
    for (const reply of readyReplies.slice(0, 5)) { // Limit to 5 posts per run
      try {
        // Check if we should post this reply (rate limiting, daily limits, etc.)
        const shouldPost = await checkPostingRules(reply);
        if (!shouldPost) {
          console.log(`[Worker] Skipping reply ${reply.id} due to posting rules`);
          continue;
        }

        // Get available discussion poster account
        const supabaseAdmin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        );

        const { data: availableAccount } = await supabaseAdmin
          .from('reddit_accounts')
          .select('*')
          .eq('is_discussion_poster', true)
          .eq('is_validated', true)
          .order('last_used_at', { ascending: true, nullsFirst: true })
          .limit(1)
          .single();

        if (!availableAccount) {
          console.log(`[Worker] No available discussion poster accounts`);
          continue;
        }

        // Check for duplicate posts to prevent spam
        const { data: existingPost } = await supabaseAdmin
          .from('auto_posting_logs')
          .select('id')
          .eq('post_id', reply.expand?.reply_to?.on_platform_external_id)
          .eq('account_id', availableAccount.id)
          .single();

        if (existingPost) {
          console.log(`[Worker] Skipping duplicate post ${reply.expand?.reply_to?.on_platform_external_id}`);
          continue;
        }

        // Post to Reddit
        const postRes = await fetch('/api/reddit/post-comment', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Internal-API': 'true' // Bypass auth for internal calls
          },
          body: JSON.stringify({
            userId: availableAccount.user_id,
            accountId: availableAccount.id,
            postId: reply.expand?.reply_to?.on_platform_external_id,
            comment: reply.text,
            subreddit: reply.expand?.reply_to?.subs_source?.topic || 'unknown'
          })
        });

        const postData = await postRes.json();

        if (postData.success) {

          // Update reply status in Beno
          await fetch(`${PB_BASE}/collections/beno_replies/records/${reply.id}`, {
            method: 'PATCH',
            headers: {
              'Authorization': BENO_AUTH_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              status: 'posted',
              posted_comment_url: postData.commentUrl,
              submitted_at: new Date().toISOString(),
              auto_posted: true
            })
          });

          // Get config ID
          const { data: configData } = await supabaseAdmin
            .from('auto_poster_configs')
            .select('id')
            .eq('product_id', reply.product)
            .single();

          // Log the post
          await supabaseAdmin.from('auto_posting_logs').insert({
            config_id: configData?.id,
            user_id: availableAccount.user_id,
            beno_reply_id: reply.id,
            product_id: reply.product,
            account_id: availableAccount.id,
            subreddit: reply.expand?.reply_to?.subs_source?.topic || 'unknown',
            post_id: reply.expand?.reply_to?.on_platform_external_id,
            comment_id: postData.commentId,
            comment_url: postData.commentUrl,
            reply_text: reply.text,
            relevance_score: reply.relevance_score,
            validation_score: reply.validation_score,
            status: 'posted',
            posted_at: new Date().toISOString()
          });

          // Update account last used timestamp
          await supabaseAdmin
            .from('reddit_accounts')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', availableAccount.id);

          // Update config counters - get current value first
          const { data: currentConfig } = await supabaseAdmin
            .from('auto_poster_configs')
            .select('posts_today')
            .eq('product_id', reply.product)
            .single();

          await supabaseAdmin
            .from('auto_poster_configs')
            .update({
              posts_today: (currentConfig?.posts_today || 0) + 1,
              last_posted_at: new Date().toISOString(),
              next_post_at: new Date(Date.now() + (30 * 60 * 1000)).toISOString() // 30 min from now
            })
            .eq('product_id', reply.product);

          successfulPosts++;
          console.log(`[Worker] Successfully posted reply ${reply.id}`);

          // Rate limiting: wait between posts
          await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second delay

        } else {
          failedPosts++;
          console.error(`[Worker] Failed to post reply ${reply.id}:`, postData.error);
        }

      } catch (error) {
        failedPosts++;
        console.error(`[Worker] Error posting reply ${reply.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Auto-posting complete. Posted ${successfulPosts} replies, ${failedPosts} failed.`,
      stats: {
        totalRepliesFound: readyReplies.length,
        successfulPosts,
        failedPosts
      }
    });

  } catch (error) {
    console.error('[Worker] Auto-posting error:', error);
    return NextResponse.json({ error: 'Auto-posting failed' }, { status: 500 });
  }
}

// Check if we should post this reply based on rules
async function checkPostingRules(reply: any): Promise<boolean> {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // Check if post is too old
  const postAge = new Date().getTime() - new Date(reply.expand?.reply_to?.created).getTime();
  const maxAgeHours = 24;
  if (postAge > maxAgeHours * 60 * 60 * 1000) {
    return false;
  }

  // Get config for this product
  const { data: config } = await supabaseAdmin
    .from('auto_poster_configs')
    .select('*')
    .eq('product_id', reply.product)
    .eq('enabled', true)
    .single();

  if (!config) return false;

  // Check daily limits
  if (config.posts_today >= config.max_posts_per_day) {
    return false;
  }

  // Check if it's time for next post
  if (config.next_post_at && new Date() < new Date(config.next_post_at)) {
    return false;
  }

  // Check quality scores
  if (config.only_high_score_replies) {
    if (reply.relevance_score < config.min_relevance_score || 
        reply.validation_score < config.min_validation_score) {
      return false;
    }
  }

  return true;
}

// Get worker status
async function getWorkerStatus() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const { data: workerStatus } = await supabaseAdmin
    .from('background_worker_status')
    .select('*')
    .in('worker_type', ['discovery', 'posting']);

  const { data: activeConfigs } = await supabaseAdmin
    .from('auto_poster_configs')
    .select('*')
    .eq('enabled', true);

  const { data: todaysPosts } = await supabaseAdmin
    .from('auto_posting_logs')
    .select('id')
    .gte('posted_at', new Date().toISOString().split('T')[0]);

  return NextResponse.json({
    success: true,
    workers: workerStatus,
    stats: {
      activeProducts: activeConfigs?.length || 0,
      postsToday: todaysPosts?.length || 0
    }
  });
}
