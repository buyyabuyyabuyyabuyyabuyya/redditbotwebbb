import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
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
 * Archives bot logs in batches of 100 per configuration, saves them as text files,
 * records the archive in archived_logs table, and removes the archived logs from bot_logs.
 */
export async function POST(req: Request) {
  try {
    // Check authentication
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { configId } = await req.json();

    // If configId is provided, archive logs only for that config
    // Otherwise, archive for all configs belonging to the user

    // First, get all configurations to archive logs for
    const configQuery = supabaseAdmin
      .from('scan_configs')
      .select('id, subreddit')
      .eq('user_id', userId);

    if (configId) {
      configQuery.eq('id', configId);
    }

    const { data: configs, error: configsError } = await configQuery;

    if (configsError) {
      console.error('Error fetching configurations:', configsError);
      return NextResponse.json(
        { error: 'Failed to fetch configurations' },
        { status: 500 }
      );
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json({
        message: 'No configurations found to archive logs',
      });
    }

    const results = [];

    // Process each configuration
    for (const config of configs) {
      // Count logs for this configuration
      const { count, error: countError } = await supabaseAdmin
        .from('bot_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
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
        results.push({
          configId: config.id,
          subreddit: config.subreddit,
          status: 'skipped',
          reason: `Only ${count} logs found (minimum 100 required)`,
        });
        continue;
      }

      // Get the logs in batches of 100
      const { data: logs, error: logsError } = await supabaseAdmin
        .from('bot_logs')
        .select('*')
        .eq('user_id', userId)
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
      console.log('[MANUAL-ARCHIVE] Selected log batch', {
        userId,
        configId: config.id,
        subreddit: config.subreddit,
        totalLogs: logs.length,
        dateRangeStart: dateRangeStart.toISOString(),
        dateRangeEnd: dateRangeEnd.toISOString()
      });
      console.log('[MANUAL-ARCHIVE] Selected log batch', {
        userId,
        configId: config.id,
        subreddit: config.subreddit,
        totalLogs: logs.length,
        dateRangeStart: dateRangeStart.toISOString(),
        dateRangeEnd: dateRangeEnd.toISOString()
      });

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
      const fileName = `${userId}/bot_logs/${config.id}/${timestamp}.txt`;

      // Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } =
        await supabaseAdmin.storage.from('logs').upload(fileName, logContent, {
          contentType: 'text/plain',
          cacheControl: '3600',
        });
      console.log('[MANUAL-ARCHIVE] Upload result', { fileName, uploadError, uploadedPath: uploadData?.path });

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
          user_id: userId,
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

      // Success!
      results.push({
        configId: config.id,
        subreddit: config.subreddit,
        status: 'success',
        archiveId: archiveRecord?.[0]?.id,
        fileName,
        logCount: logs.length,
        deletedCount: logIds.length,
        retainedCount: logs.length - logIds.length,
      });

      // Record the manual archive action in bot_logs
      try {
        await supabaseAdmin.from('bot_logs').insert({
          user_id: userId,
          action: 'archive_manual',
          status: 'success',
          subreddit: config.subreddit,
          config_id: config.id,
          message: `Manually archived ${logs.length} logs for r/${config.subreddit}`,
          created_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.error('Failed to insert manual archive log:', logErr);
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error('Error archiving logs:', error);
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

/**
 * Handle GET requests to manually trigger the archival process
 */
export async function GET(req: Request) {
  try {
    // Check authentication
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get URL search params
    const url = new URL(req.url);
    const configId = url.searchParams.get('configId');

    // Build the request body
    const body = configId ? { configId } : {};

    // Call the POST handler to process the archival
    const response = await POST(
      new Request(req.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    );

    return response;
  } catch (error: any) {
    console.error('Error in GET handler:', error);
    return NextResponse.json(
      {
        error: `Error triggering log archival: ${error?.message || 'Unknown error'}`,
      },
      {
        status: 500,
      }
    );
  }
}
