import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase admin client with service role key for bypassing RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Cron job to automatically archive logs for all users when configs have >= 100 logs
 * This endpoint should be called by a scheduled task/cron job
 * It requires the CRON_SECRET environment variable to be set and passed as a header
 */
export async function GET(req: Request) {
  try {
    // Validate secret to ensure this is called by authorized systems
    const authHeader = req.headers.get('x-cron-secret');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET environment variable not set');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (authHeader !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all configurations with their log counts
    const { data: configsWithLogs, error: configsError } =
      await supabaseAdmin.from('scan_configs').select(`
        id,
        user_id,
        subreddit
      `);

    if (configsError) {
      console.error('Error fetching configurations:', configsError);
      return NextResponse.json(
        { error: 'Failed to fetch configurations' },
        { status: 500 }
      );
    }

    if (!configsWithLogs || configsWithLogs.length === 0) {
      return NextResponse.json({ message: 'No configurations found' });
    }

    const results = [];

    // Process each configuration
    for (const config of configsWithLogs) {
      try {
        // Count logs for this configuration
        const { count, error: countError } = await supabaseAdmin
          .from('bot_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', config.user_id)
          .eq('config_id', config.id);

        if (countError) {
          console.error(
            `Error counting logs for config ${config.id}:`,
            countError
          );
          continue;
        }

        if (!count || count < 100) {
          // Skip if there are fewer than 100 logs
          continue;
        }

        // Get the logs in batches of 100
        const { data: logs, error: logsError } = await supabaseAdmin
          .from('bot_logs')
          .select('*')
          .eq('user_id', config.user_id)
          .eq('config_id', config.id)
          .order('created_at', { ascending: true })
          .limit(100);

        if (logsError || !logs || logs.length === 0) {
          console.error(
            `Error fetching logs for config ${config.id}:`,
            logsError
          );
          continue;
        }

        // Format logs as text
        const dateRangeStart = new Date(logs[0].created_at);
        const dateRangeEnd = new Date(logs[logs.length - 1].created_at);

        let logContent = `=== BOT LOGS ARCHIVE ===\n`;
        logContent += `Configuration ID: ${config.id}\n`;
        logContent += `Subreddit: r/${config.subreddit}\n`;
        logContent += `Date Range: ${dateRangeStart.toISOString()} to ${dateRangeEnd.toISOString()}\n`;
        logContent += `Total Logs: ${logs.length}\n\n`;

        logs.forEach((log, index) => {
          logContent += `--- LOG ENTRY #${index + 1} ---\n`;
          logContent += `Time: ${log.created_at}\n`;
          logContent += `Action: ${log.action}\n`;
          logContent += `Status: ${log.status}\n`;

          if (log.recipient) {
            logContent += `Recipient: ${log.recipient}\n`;
          }

          if (log.error_message) {
            logContent += `Error: ${log.error_message}\n`;
          }

          if (log.analysis_data) {
            try {
              const analysisData =
                typeof log.analysis_data === 'string'
                  ? JSON.parse(log.analysis_data)
                  : log.analysis_data;
              logContent += `Analysis: ${JSON.stringify(analysisData, null, 2)}\n`;
            } catch (e) {
              logContent += `Analysis: ${log.analysis_data}\n`;
            }
          }

          logContent += `\n`;
        });

        // Generate a filename
        const timestamp = new Date().toISOString().replace(/[:\.]/g, '-');
        const fileName = `${config.user_id}/bot_logs/${config.id}/${timestamp}.txt`;

        // Upload file to Supabase Storage
        const { data: uploadData, error: uploadError } =
          await supabaseAdmin.storage
            .from('logs')
            .upload(fileName, logContent, {
              contentType: 'text/plain',
              cacheControl: '3600',
            });

        if (uploadError) {
          console.error(
            `Error uploading log file for config ${config.id}:`,
            uploadError
          );
          results.push({
            configId: config.id,
            subreddit: config.subreddit,
            status: 'error',
            reason: `Failed to upload log file: ${uploadError.message}`,
          });
          continue;
        }

        // Record the archive in archived_logs table
        const { data: archiveRecord, error: archiveError } = await supabaseAdmin
          .from('archived_logs')
          .insert({
            user_id: config.user_id,
            config_id: config.id,
            file_path: fileName,
            log_count: logs.length,
            date_range_start: dateRangeStart.toISOString(),
            date_range_end: dateRangeEnd.toISOString(),
          })
          .select();

        if (archiveError) {
          console.error(
            `Error recording archive for config ${config.id}:`,
            archiveError
          );

          // Attempt to delete the uploaded file since we couldn't record it
          await supabaseAdmin.storage.from('logs').remove([fileName]);

          results.push({
            configId: config.id,
            subreddit: config.subreddit,
            status: 'error',
            reason: `Failed to record archive: ${archiveError.message}`,
          });
          continue;
        }

        // Filter logs to exclude those with action type 'start_bot' from deletion
        const logsToDelete = logs.filter((log) => log.action !== 'start_bot');

        // Get the IDs of logs we're deleting (excluding start_bot logs)
        const logIds = logsToDelete.map((log) => log.id);

        // Skip deletion if there are no logs to delete after filtering
        if (logIds.length === 0) {
          results.push({
            userId: config.user_id,
            configId: config.id,
            subreddit: config.subreddit,
            status: 'success',
            archiveId: archiveRecord?.[0]?.id,
            fileName,
            logCount: logs.length,
            deletedCount: 0,
            message:
              'Logs archived but none deleted (only contained start_bot logs)',
          });
          continue;
        }

        // Delete the archived logs that aren't start_bot logs
        const { error: deleteError } = await supabaseAdmin
          .from('bot_logs')
          .delete()
          .in('id', logIds);

        if (deleteError) {
          console.error(
            `Error deleting logs for config ${config.id}:`,
            deleteError
          );
          results.push({
            configId: config.id,
            subreddit: config.subreddit,
            status: 'partial',
            reason: `Logs archived but not deleted: ${deleteError.message}`,
          });
          continue;
        }

        // Schedule cleanup of this archive in 1 hour using QStash
        try {
          const { publishQStashMessage } = await import('../../../utils/qstash');
          await publishQStashMessage({
            destination: `${process.env.NEXT_PUBLIC_APP_URL}/api/cron/cleanup-archives`,
            body: { archiveId: archiveRecord?.[0]?.id },
            delayMs: 60 * 60 * 1000, // 1 hour delay
            retries: 2,
          });
          console.log(`Scheduled cleanup for archive ${archiveRecord?.[0]?.id} in 1 hour`);
        } catch (qstashError) {
          console.error('Failed to schedule archive cleanup:', qstashError);
          // Don't fail the whole operation if scheduling fails
        }

        // Success!
        results.push({
          userId: config.user_id,
          configId: config.id,
          subreddit: config.subreddit,
          status: 'success',
          archiveId: archiveRecord?.[0]?.id,
          fileName,
          logCount: logs.length,
          deletedCount: logIds.length,
          retainedCount: logs.length - logIds.length,
        });
      } catch (error: any) {
        console.error(`Error processing config ${config.id}:`, error);
        results.push({
          configId: config.id,
          subreddit: config.subreddit || 'unknown',
          status: 'error',
          reason: error?.message || 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: configsWithLogs.length,
      results,
    });
  } catch (error: any) {
    console.error('Error in automatic log archival cron job:', error);
    return NextResponse.json(
      {
        error: `Error archiving logs: ${error?.message || 'Unknown error'}`,
      },
      {
        status: 500,
      }
    );
  }
}
