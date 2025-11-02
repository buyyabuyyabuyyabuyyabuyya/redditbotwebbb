import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { BUSINESS_SUBREDDITS } from '../../../../lib/redditService';
import { PostQueueService } from '../../../../lib/postQueueService';
import { CircuitBreakerService } from '../../../../lib/circuitBreakerService';

// Cron job endpoint for automated posting
export async function POST(req: Request) {
  console.log('[CRON] ===== CRON ENDPOINT CALLED =====');
  console.log('[CRON] Request URL:', req.url);
  console.log('[CRON] Request method:', req.method);
  console.log('[CRON] All headers:', Object.fromEntries(req.headers.entries()));
  
  try {
    console.log('[CRON] ===== AUTO-POSTER CRON JOB STARTED =====');
    
    // Verify cron secret from headers (Upstash sends it this way)
    const authHeader = req.headers.get('Authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    console.log('[CRON] Auth check - received:', authHeader ? `Bearer ${authHeader.substring(7, 17)}...` : 'none');
    console.log('[CRON] Expected:', expectedAuth ? `Bearer ${expectedAuth.substring(7, 17)}...` : 'none');
    
    if (authHeader !== expectedAuth) {
      console.error('[CRON] Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[CRON] Authentication successful, starting auto-poster job...');

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Initialize services
    const circuitBreaker = new CircuitBreakerService();
    const postQueue = new PostQueueService();

    // Check circuit breaker status
    const circuitStatus = await circuitBreaker.canExecute('posting');
    if (!circuitStatus.allowed) {
      console.log(`[CRON] Circuit breaker preventing execution: ${circuitStatus.reason}`);
      return NextResponse.json({
        success: false,
        message: 'Circuit breaker active',
        reason: circuitStatus.reason,
        backoffUntil: circuitStatus.backoffUntil
      });
    }

    // Check account availability before proceeding
    const accountCheck = await circuitBreaker.checkAccountAvailability();
    if (!accountCheck.available) {
      console.log(`[CRON] No accounts available: ${accountCheck.reason}`);
      await circuitBreaker.recordFailure('posting', accountCheck.reason || 'No accounts available', 'low');
      return NextResponse.json({
        success: false,
        message: 'No Reddit accounts available',
        reason: accountCheck.reason,
        availableAccounts: accountCheck.count
      });
    }

    console.log(`[CRON] ${accountCheck.count} Reddit accounts available for posting`);

    // Reset daily counters if needed
    await supabaseAdmin.rpc('reset_daily_post_counts');

    // First, let's see ALL configs to debug the issue
    const { data: debugConfigs, error: debugError } = await supabaseAdmin
      .from('auto_poster_configs')
      .select('*');

    console.log(`[CRON] DEBUG: Total configs in database: ${debugConfigs?.length || 0}`);
    if (debugConfigs && debugConfigs.length > 0) {
      debugConfigs.forEach(config => {
        console.log(`[CRON] DEBUG Config ${config.id}: enabled=${config.enabled}, status=${config.status}, next_post_at=${config.next_post_at}, posts_today=${config.posts_today}/${config.max_posts_per_day}`);
      });
    }

    // Get configs that are ready to post
    const currentTime = new Date().toISOString();
    console.log(`[CRON] Current time for comparison: ${currentTime}`);
    
    const { data: allConfigs, error: configError } = await supabaseAdmin
      .from('auto_poster_configs')
      .select('*')
      .eq('enabled', true)
      .eq('status', 'active')
      .or('next_post_at.is.null,next_post_at.lt.' + currentTime);

    console.log(`[CRON] Configs matching enabled=true AND status=active: ${allConfigs?.length || 0}`);

    if (configError) {
      console.error('[CRON] Error fetching configs:', configError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Filter configs that haven't reached daily limit
    const readyConfigs = allConfigs?.filter(config => 
      config.posts_today < config.max_posts_per_day
    ) || [];

    console.log(`[CRON] Found ${readyConfigs?.length || 0} configs ready to post after daily limit filter`);

    // If no configs are ready but we have active configs with future next_post_at, 
    // check if any should be reset to post now (this handles the case where configs get stuck in the future)
    // ----------------------------------------------------------------------------------
    // If no configs are ready we still want to rotate the subreddit index so we do not
    // keep querying the same subreddit on every cron run (e.g. r/productivity twice).
    // ----------------------------------------------------------------------------------
    if (readyConfigs.length === 0) {
      const { data: activeConfigs } = await supabaseAdmin
        .from('auto_poster_configs')
        .select('*')
        .eq('enabled', true)
        .eq('status', 'active');
      
      if (activeConfigs && activeConfigs.length > 0) {
        console.log(`[CRON] Found ${activeConfigs.length} active configs with future post times, resetting to post now`);
        
        // Reset next_post_at to current time for all active configs
        const { error: resetError } = await supabaseAdmin
          .from('auto_poster_configs')
          .update({ next_post_at: currentTime })
          .eq('enabled', true)
          .eq('status', 'active');
        
        if (resetError) {
          console.error('[CRON] Error resetting config post times:', resetError);
        } else {
          console.log('[CRON] Successfully reset config post times, re-querying for ready configs');
          
          // Re-query for configs now that we've reset the times (use fresh timestamp)
          const freshTime = new Date().toISOString();
          console.log(`[CRON] Fresh time for re-query: ${freshTime}`);
          
          const { data: updatedConfigs } = await supabaseAdmin
            .from('auto_poster_configs')
            .select('*')
            .eq('enabled', true)
            .eq('status', 'active')
            .or('next_post_at.is.null,next_post_at.lt.' + freshTime);
          
          // Update readyConfigs with the newly available ones
          const updatedReadyConfigs = updatedConfigs?.filter(config => 
            config.posts_today < config.max_posts_per_day
          ) || [];
          
          console.log(`[CRON] After reset: ${updatedReadyConfigs.length} configs now ready to post`);
          readyConfigs.push(...updatedReadyConfigs);

          // If we STILL have 0 configs ready, rotate subreddit index for all active configs
          if (readyConfigs.length === 0) {
            console.log('[CRON] Still no ready configs after reset – rotating subreddit index for active configs');
            for (const activeConfig of activeConfigs || []) {
              const nextIndex = ((activeConfig.current_subreddit_index || 0) + 1) % BUSINESS_SUBREDDITS.length;
              await supabaseAdmin
                .from('auto_poster_configs')
                .update({
                  current_subreddit_index: nextIndex,
                  last_subreddit_used: BUSINESS_SUBREDDITS[nextIndex]
                })
                .eq('id', activeConfig.id);
            }
          }
        }
      }
    }

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

        // Get next available Reddit account directly from database (bypass HTTP layer)
        const { data: availableAccounts } = await supabaseAdmin
          .from('reddit_accounts')
          .select('*')
          .eq('is_validated', true)
          .eq('is_discussion_poster', true)
          .eq('status', 'active')
          .order('last_used_at', { ascending: true, nullsFirst: true });

        // Filter accounts that are actually available (not in cooldown)
        const now = new Date();
        const availableAccountsFiltered = availableAccounts?.filter(account => {
          if (account.is_available) return true;
          
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
          console.error(`[CRON] No Reddit accounts available for posting (${availableAccounts?.length || 0} total accounts, ${availableAccountsFiltered.length} available after cooldown check)`);
          await circuitBreaker.recordFailure('posting', 'No Reddit accounts available', 'low');
          totalErrors++;
          continue;
        }

        console.log(`[CRON] Using Reddit account: ${redditAccount.username} (ID: ${redditAccount.id})`);

        // Call the main proxy endpoint to handle everything
        const query = websiteConfig.target_keywords?.join(' ') || websiteConfig.customer_segments?.join(' ') || 'business';
        
        console.log(`[CRON] Calling proxy endpoint for r/${targetSubreddit} with query: ${query}`);
        
        try {
          const proxyResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://redditoutreach.com'}/api/reddit/proxy`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.CRON_SECRET}`
            },
            body: JSON.stringify({
              query,
              subreddit: targetSubreddit,
              limit: 10,
              userId: config.user_id,
              websiteConfig: websiteConfig,
              configId: config.id
            })
          });

          if (!proxyResponse.ok) {
            throw new Error(`Proxy failed: ${proxyResponse.status}`);
          }

          const proxyData = await proxyResponse.json();
          console.log(`[CRON] Proxy response:`, { 
            success: proxyData.success, 
            posted: proxyData.posted,
            relevant: proxyData.relevant,
            total: proxyData.total 
          });

          if (proxyData.success && proxyData.posted) {
            console.log(`[CRON] Successfully posted via proxy for config ${config.id}`);
            totalPosts++;
            
            // Update config's next post time
            await supabaseAdmin
              .from('auto_poster_configs')
              .update({
                next_post_at: new Date(Date.now() + config.interval_minutes * 60 * 1000).toISOString()
              })
              .eq('id', config.id);
          } else {
            console.log(`[CRON] Proxy completed but no post made for config ${config.id}`);
          }
          
          continue; // Move to next config
        } catch (error) {
          console.error(`[CRON] Proxy call failed for r/${targetSubreddit}:`, error);
          totalErrors++;
          continue;
        }


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
