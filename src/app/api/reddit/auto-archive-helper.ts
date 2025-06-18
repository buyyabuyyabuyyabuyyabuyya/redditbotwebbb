import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Checks if a configuration has more than 100 logs and triggers archival if needed
 * This helper now archives all logs (except the essential lifecycle markers)
 * when the log count reaches 100. Essential logs are:
 *   - start_bot (marks when the bot was enabled)
 *   - start_scan (marks when a particular scan cycle began)
 *
 * When archiveAll === true we archive regardless of count. In all cases we
 * persist those essential logs in the table so a user can still see when the
 * bot was started and when a scan cycle kicked off.
 */
export async function checkAndArchiveLogs(
  supabaseAdmin: SupabaseClient,
  userId: string,
  configId: string,
  subreddit: string,
  archiveAll: boolean = false
): Promise<void> {
  // Log when this function is called
  console.log(`===== AUTO-ARCHIVE CHECK TRIGGERED =====`);
  console.log(
    `Checking logs for user ${userId}, config ${configId} (r/${subreddit})`
  );
  try {
    console.log(
      `Checking if logs need to be archived for config ${configId}...`
    );

    // Count logs for this configuration
    console.log(`Querying Supabase for log count...`);
    const { count, error: countError } = await supabaseAdmin
      .from('bot_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('config_id', configId);

    // Log the count result
    console.log(
      `Log count query result: ${count}, error: ${countError ? JSON.stringify(countError) : 'none'}`
    );

    if (countError) {
      console.error(`Error counting logs for config ${configId}:`, countError);
      return;
    }

    if (!count) {
      console.log(
        `No logs count returned, cannot determine if archival is needed`
      );
      return;
    }

    // If archiveAll is false, we only archive if we have at least 100 logs
    // If archiveAll is true, we archive regardless of count, as long as there are logs
    if (!archiveAll && count < 100) {
      console.log(
        `Only ${count} logs found for config ${configId} - skipping archival (minimum 100 required)`
      );
      return;
    }

    if (count === 0) {
      console.log(`No logs found for config ${configId} - nothing to archive`);
      return;
    }

    // If we reach here, we definitely have enough logs to archive

    console.log(
      `Auto-archival triggered for config ${configId} with ${count} logs`
    );

    // Log that we're starting auto-archival
    await supabaseAdmin.from('bot_logs').insert([
      {
        user_id: userId,
        action: 'auto_archive_started',
        status: 'info',
        subreddit: subreddit,
        config_id: configId,
        message: archiveAll
          ? `Automatically archiving all logs (${count}) after scan completion`
          : `Automatically archiving logs because count (${count}) reached threshold of 100`,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      // Build the query for logs to archive.
      // We ALWAYS exclude the essential lifecycle logs so they remain in the table.
      let query = supabaseAdmin
        .from('bot_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('config_id', configId)
        .not('action', 'in', '(start_bot,start_scan)')
        .order('created_at', { ascending: true });

      // If archiveAll === false, limit to 100 oldest; otherwise fetch everything except the two essentials
      if (!archiveAll) {
        query = query.limit(100);
      }

      const { data: logs, error: logsError } = await query;

      if (logsError || !logs || logs.length === 0) {
        throw new Error(
          `Failed to fetch logs for archival: ${logsError?.message}`
        );
      }

      // Format logs as text
      const dateRangeStart = new Date(logs[0].created_at);
      const dateRangeEnd = new Date(logs[logs.length - 1].created_at);

      let logContent = `=== BOT LOGS ARCHIVE ===\n`;
      logContent += `Configuration ID: ${configId}\n`;
      logContent += `Subreddit: r/${subreddit}\n`;
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

        if (log.message) {
          logContent += `Message: ${log.message}\n`;
        }

        logContent += `\n`;
      });

      // Generate a unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `archive/${userId}/${configId}/${timestamp}.txt`;

      // Upload the log file to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('logs')
        .upload(fileName, logContent, {
          contentType: 'text/plain',
          cacheControl: '3600',
        });

      if (uploadError) {
        throw new Error(`Failed to upload log file: ${uploadError.message}`);
      }

      // Record the archive in archived_logs table
      const { data: archiveRecord, error: archiveError } = await supabaseAdmin
        .from('archived_logs')
        .insert({
          user_id: userId,
          config_id: configId,
          file_path: fileName,
          log_count: logs.length,
          date_range_start: dateRangeStart.toISOString(),
          date_range_end: dateRangeEnd.toISOString(),
        })
        .select();

      if (archiveError) {
        // If we can't record the archive, clean up the uploaded file
        await supabaseAdmin.storage.from('logs').remove([fileName]);
        throw new Error(`Failed to record archive: ${archiveError.message}`);
      }

      // Filter logs to exclude those with action type 'start_bot' or 'start_scan' from deletion
      const logsToDelete = logs.filter(
        (log) => log.action !== 'start_bot' && log.action !== 'start_scan'
      );

      // Get the IDs of logs we're deleting (excluding start_bot logs)
      const logIds = logsToDelete.map((log) => log.id);

      // Only proceed with deletion if we have logs to delete
      if (logIds.length > 0) {
        // Delete the archived logs that aren't start_bot logs
        const { error: deleteError } = await supabaseAdmin
          .from('bot_logs')
          .delete()
          .in('id', logIds);

        if (deleteError) {
          throw new Error(
            `Logs archived but not deleted: ${deleteError.message}`
          );
        }
      }

      // Log successful archival
      await supabaseAdmin.from('bot_logs').insert([
        {
          user_id: userId,
          action: 'auto_archive_completed',
          status: 'success',
          subreddit: subreddit,
          config_id: configId,
          message: `Successfully archived ${logs.length} logs, deleted ${logIds.length} (kept ${logs.length - logIds.length} essential lifecycle logs)`,
          created_at: new Date().toISOString(),
        },
      ]);

      console.log(`Successfully archived logs for config ${configId}`);
    } catch (archiveError: any) {
      console.error('Error during auto-archival:', archiveError);

      // Log the error
      await supabaseAdmin.from('bot_logs').insert([
        {
          user_id: userId,
          action: 'auto_archive_error',
          status: 'error',
          subreddit: subreddit,
          config_id: configId,
          error_message:
            archiveError instanceof Error
              ? archiveError.message
              : String(archiveError),
          created_at: new Date().toISOString(),
        },
      ]);
    }
  } catch (error: any) {
    console.error('Unexpected error in checkAndArchiveLogs:', error);
    // Log additional error details if available
    if (error instanceof Error) {
      console.error(`Error name: ${error.name}, message: ${error.message}`);
      console.error(
        `Stack trace: ${error.stack || 'No stack trace available'}`
      );
    }
  }
}
