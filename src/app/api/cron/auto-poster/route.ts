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

        // Call the background worker for this specific product
        const workerRes = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/beno/background-worker`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'auto_post',
            productId: config.product_id,
            configId: config.id 
          })
        });

        const workerData = await workerRes.json();
        
        if (workerData.success) {
          totalPosts += workerData.stats?.successfulPosts || 0;
          console.log(`[CRON] Successfully processed config ${config.id}: ${workerData.stats?.successfulPosts || 0} posts`);
        } else {
          totalErrors++;
          console.error(`[CRON] Worker failed for config ${config.id}:`, workerData.error);
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
export async function POST(req: Request) {
  return NextResponse.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString() 
  });
}
