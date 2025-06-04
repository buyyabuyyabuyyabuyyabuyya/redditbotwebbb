import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAndArchiveLogs } from '../auto-archive-helper';

// Initialize Supabase Admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(req: NextRequest) {
  console.log('========== DEDICATED LOG ARCHIVAL CHECK ==========');
  try {
    // Parse the request body
    const { userId, configId, subreddit } = await req.json();

    // Validate required fields
    if (!userId || !configId || !subreddit) {
      console.error('Missing required fields for log archival check');
      return NextResponse.json(
        { error: 'Missing required fields: userId, configId, and subreddit are required' },
        { status: 400 }
      );
    }

    console.log(`ARCHIVAL CHECK: Checking logs for user ${userId}, config ${configId} (r/${subreddit})`);

    // First log this check to the database
    try {
      await supabaseAdmin.from('bot_logs').insert({
        user_id: userId,
        action: 'dedicated_archive_check',
        status: 'info',
        subreddit: subreddit,
        config_id: configId,
        message: 'Dedicated archive check endpoint called',
        created_at: new Date().toISOString()
      });
      console.log(`ARCHIVAL CHECK: Logged check to database`);
    } catch (logError) {
      console.error('Error logging archive check to database:', logError);
    }

    // Get the current log count before archival
    const { count: beforeCount, error: countError } = await supabaseAdmin
      .from('bot_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('config_id', configId);
      
    console.log(`ARCHIVAL CHECK: Current log count before check: ${beforeCount || 'unknown'}`);

    // Call the checkAndArchiveLogs function to archive logs if needed
    console.log(`ARCHIVAL CHECK: Calling checkAndArchiveLogs function`);
    await checkAndArchiveLogs(supabaseAdmin, userId, configId, subreddit);

    // Get the log count after archival to see if anything changed
    const { count: afterCount } = await supabaseAdmin
      .from('bot_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('config_id', configId);
      
    console.log(`ARCHIVAL CHECK: Log count after check: ${afterCount || 'unknown'}`);
    console.log(`ARCHIVAL CHECK: Difference: ${beforeCount && afterCount ? beforeCount - afterCount : 'unknown'}`);
    console.log('========== DEDICATED LOG ARCHIVAL CHECK COMPLETE ==========');

    // Return a success response with the counts
    return NextResponse.json({
      success: true,
      message: 'Log archival check completed successfully',
      beforeCount: beforeCount || 0,
      afterCount: afterCount || 0,
      difference: beforeCount && afterCount ? beforeCount - afterCount : 0
    });
  } catch (error) {
    console.error('========== ERROR IN DEDICATED LOG ARCHIVAL CHECK ==========');
    console.error('Error in check-archive route:', error);
    
    // Detailed error logging for debugging
    if (error instanceof Error) {
      console.error(`Error name: ${error.name}`);
      console.error(`Error message: ${error.message}`);
      console.error(`Error stack: ${error.stack}`);
    }

    return NextResponse.json(
      { error: `Failed to check logs for archival: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
