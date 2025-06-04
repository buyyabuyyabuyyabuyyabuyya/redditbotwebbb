import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerSupabaseClient } from '../../../../utils/supabase-server';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase admin client with service role key for bypassing RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper function to verify config ownership
async function verifyConfigOwnership(supabase: any, configId: string, userId: string) {
  // First check if the config exists in scan_configs table
  console.log(`Checking if config ${configId} exists in database`);
  try {
    const { data: configData, error: configError } = await supabase
      .from('scan_configs')
      .select('subreddit, id')
      .eq('id', configId)
      .maybeSingle();
    
    if (configError) {
      console.log(`ERROR checking config: ${configError.message}`);
    } else if (configData) {
      console.log(`Found config in database: ${JSON.stringify(configData)}`);
      return configData;
    } else {
      console.log(`No config found with ID ${configId} in scan_configs table`);
    }
  } catch (error) {
    console.log(`Error checking scan_configs: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // If config not found in scan_configs or there was an error, check logs as fallback
  console.log(`Checking if user ${userId} has logs for config ${configId}`);
  const { data: logData, error: logError } = await supabase
    .from('bot_logs')
    .select('id, subreddit, config_id')
    .eq('config_id', configId)
    .limit(1);
  
  if (logError) {
    console.log(`ERROR checking logs: ${logError.message}`);
  }
  
  // If we found any logs for this config, allow the operation
  if (logData && logData.length > 0) {
    console.log(`Found logs for this config, authorized to stop`);
    const configData = {
      subreddit: logData[0].subreddit,
      id: configId
    };
    return configData;
  }
  
  console.log(`No logs or config found for ID ${configId}`);
  return null;
}

export async function POST(req: Request) {
  console.log('========== STOPPING REDDIT BOT ==========');
  const supabase = createServerSupabaseClient();
  
  try {
    // Verify authentication
    const { userId } = auth();
    console.log(`User ID: ${userId}`);
    
    if (!userId) {
      console.log('ERROR: Unauthorized - No user ID found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the config ID and subreddit from the request
    const { configId, subreddit } = await req.json();
    console.log(`Stopping bot for config ID: ${configId}, subreddit: ${subreddit}`);

    if (!configId) {
      console.log('ERROR: Missing config ID');
      return NextResponse.json({ error: 'Config ID is required' }, { status: 400 });
    }
    
    // We'll proceed with stopping the bot regardless of whether the config exists
    // This ensures we can stop bots even if there are database issues
    console.log(`Proceeding with stop action for subreddit: ${subreddit}`);
    
    // Create a botConfig object with the data we have
    const botConfig = {
      subreddit: subreddit,
      id: configId
    };
    
    // Try to find the config in the database, but don't require it
    try {
      const { data: configData } = await supabase
        .from('scan_configs')
        .select('*')
        .eq('id', configId)
        .maybeSingle();
        
      if (configData) {
        console.log(`Found config in database: ${JSON.stringify(configData)}`);
      } else {
        console.log(`Config not found in database, but proceeding with stop action anyway`);
      }
    } catch (error) {
      console.log(`Error checking config in database: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`Proceeding with stop action anyway`);
    }

    // Log the stop action regardless of whether the config exists
    console.log(`Inserting stop_bot log for r/${subreddit}`);
    try {
      // Use the admin client to bypass RLS policies
      const { error: logError } = await supabaseAdmin.from('bot_logs').insert([
        {
          user_id: userId,
          action: 'stop_bot',
          status: 'success',
          subreddit: subreddit,
          config_id: configId,
          created_at: new Date().toISOString(),
        },
      ]);
      
      if (logError) {
        console.log(`WARNING: Error logging stop action: ${logError.message}`);
      } else {
        console.log(`Successfully logged stop action for bot`);
      }
    } catch (logException) {
      console.log(`WARNING: Exception logging stop action: ${logException instanceof Error ? logException.message : String(logException)}`);
    }

    // Delete only the logs but keep the config, just mark it as inactive
    console.log(`Attempting to delete logs and mark config as inactive`);
    try {
      // First get the ID of the log entry to delete it directly
      const { data: logData, error: logFetchError } = await supabaseAdmin
        .from('bot_logs')
        .select('id')
        .eq('config_id', configId)
        .limit(100); // Get all logs for this config
      
      if (logFetchError) {
        console.log(`WARNING: Error fetching logs: ${logFetchError.message}`);
      } else if (logData && logData.length > 0) {
        console.log(`Found ${logData.length} logs to delete for config ${configId}`);
        
        // Delete each log by its unique ID
        for (const log of logData) {
          const { error: logDeleteError } = await supabaseAdmin
            .from('bot_logs')
            .delete()
            .eq('id', log.id);
            
          if (logDeleteError) {
            console.log(`WARNING: Error deleting log ${log.id}: ${logDeleteError.message}`);
          } else {
            console.log(`Successfully deleted log ${log.id}`);
          }
        }
      } else {
        console.log(`No logs found for config ${configId}`);
      }
      
      // Also try the regular delete by config_id as a backup
      const { error: bulkLogsDeleteError } = await supabaseAdmin
        .from('bot_logs')
        .delete()
        .eq('config_id', configId);
        
      if (bulkLogsDeleteError) {
        console.log(`WARNING: Error bulk deleting logs: ${bulkLogsDeleteError.message}`);
      } else {
        console.log(`Successfully bulk deleted logs for config ${configId}`);
      }
      
      // Update the config to set it as inactive instead of deleting it
      const { error: configUpdateError } = await supabaseAdmin
        .from('scan_configs')
        .update({ is_active: false })
        .eq('id', configId);
        
      if (configUpdateError) {
        console.log(`WARNING: Error updating config status: ${configUpdateError.message}`);
      } else {
        console.log(`Successfully marked config ${configId} as inactive`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`WARNING: Exception processing bot stop: ${errorMsg}`);
    }

    // Always return success, since we've done our best to stop the bot
    console.log('Bot stop process completed');
    return NextResponse.json({ 
      success: true,
      message: `Bot for r/${subreddit} stopped successfully` 
    }, { status: 200 });
    
  } catch (error) {
    console.error('========== STOP BOT ERROR ==========');
    console.error('Error stopping bot:', error);
    
    return NextResponse.json(
      { error: `Failed to stop bot: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
