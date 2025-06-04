import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../utils/supabase-server';

// Using the imported createServerSupabaseClient function

// This endpoint runs every minute to check and trigger scans
export async function GET() {
  const supabase = createServerSupabaseClient();
  try {
    // Get all active scan configurations that are due for scanning
    let configs = [];
    try {
      const { data, error: configError } = await supabase
        .from('scan_configs')
        .select('*')
        .eq('is_active', true);

      if (configError) {
        // Check if error is due to missing table
        if (
          configError.code === '42P01' ||
          configError.message?.includes('does not exist')
        ) {
          console.warn('scan_configs table does not exist yet');
          configs = [];
        } else {
          throw configError;
        }
      } else {
        // Filter configs based on their individual scan intervals
        configs = (data || []).filter((config) => {
          // If no last scan time, it's eligible for scanning
          if (!config.last_scan_time) {
            return true;
          }

          const lastScanTime = new Date(config.last_scan_time).getTime();
          const currentTime = Date.now();
          const intervalMs = (config.scan_interval || 30) * 60 * 1000; // Convert minutes to milliseconds

          // Check if enough time has passed since the last scan based on this config's interval
          return currentTime - lastScanTime >= intervalMs;
        });

        console.log(
          `Found ${configs.length} configs due for scanning out of ${data?.length || 0} active configs`
        );
      }
    } catch (error: any) {
      console.error(
        `Error fetching scan configs: ${error?.message || 'Unknown error'}`
      );
      configs = [];
    }

    // Get all active users from the configurations
    const uniqueUserConfigs = new Map();
    configs?.forEach((config) => {
      if (!uniqueUserConfigs.has(config.user_id)) {
        uniqueUserConfigs.set(config.user_id, []);
      }
      uniqueUserConfigs.get(config.user_id).push(config);
    });

    // Check for logs that need archiving for each user and their configs
    console.log('========== PROACTIVE LOG ARCHIVAL CHECK ==========');
    console.log(
      `Starting proactive log archival check for ${uniqueUserConfigs.size} users`
    );

    const archivePromises = Array.from(uniqueUserConfigs.entries()).map(
      async ([userId, userConfigs]) => {
        try {
          console.log(
            `Checking logs for archival for user ${userId} with ${userConfigs.length} configs`
          );

          // For each user's config, check if logs need to be archived
          const configArchivePromises = userConfigs.map(async (config: any) => {
            try {
              console.log(
                `Sending archive check request for config ${config.id} (r/${config.subreddit})`
              );

              const response = await fetch(
                process.env.NEXT_PUBLIC_APP_URL + '/api/reddit/check-archive',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    userId: userId,
                    configId: config.id,
                    subreddit: config.subreddit,
                  }),
                }
              );

              if (!response.ok) {
                throw new Error(
                  `Failed to check logs for archival for config ${config.id}`
                );
              }

              const result = await response.json();
              console.log(
                `Archive check for config ${config.id} completed: ${JSON.stringify(result)}`
              );
              return result;
            } catch (error) {
              console.error(
                `Error checking logs for archival for config ${config.id}:`,
                error
              );
              return null;
            }
          });

          const results = await Promise.all(configArchivePromises);
          console.log(
            `Completed archive checks for user ${userId}: ${results.length} configs processed`
          );
          return results;
        } catch (error) {
          console.error(`Error processing archival for user ${userId}:`, error);
          return null;
        }
      }
    );

    // Wait for archive checks to complete
    const archiveResults = await Promise.all(archivePromises || []);
    console.log(`========== PROACTIVE LOG ARCHIVAL COMPLETE ==========`);
    console.log(
      `Processed archive checks for ${archiveResults.filter(Boolean).length} users`
    );

    // Record the archive check in the logs table
    try {
      const entries = Array.from(uniqueUserConfigs.entries());
      for (const entry of entries) {
        const userId = entry[0];
        const userConfigs = entry[1];

        for (const config of userConfigs) {
          await supabase.from('bot_logs').insert({
            user_id: userId,
            action: 'worker_archive_check',
            status: 'info',
            subreddit: config.subreddit,
            config_id: config.id,
            message: 'Proactive log archival check from worker',
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch (logError) {
      console.error('Failed to log archive check to database:', logError);
    }

    // Trigger scan for each configuration
    const scanPromises = configs?.map(async (config) => {
      try {
        const response = await fetch(
          process.env.NEXT_PUBLIC_APP_URL + '/api/reddit/scan',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ configId: config.id }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to scan for config ${config.id}`);
        }

        return await response.json();
      } catch (error) {
        console.error(`Error scanning config ${config.id}:`, error);
        return null;
      }
    });

    const results = await Promise.all(scanPromises || []);

    return NextResponse.json({
      success: true,
      scansTriggered: results.length,
      results: results.filter(Boolean),
    });
  } catch (error) {
    console.error('Worker error:', error);
    return NextResponse.json(
      { error: 'Worker execution failed' },
      { status: 500 }
    );
  }
}
