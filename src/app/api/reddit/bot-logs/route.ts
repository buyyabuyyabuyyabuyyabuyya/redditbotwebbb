import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';

// Define types for log filtering and response
type LogLevel = 'info' | 'success' | 'warning' | 'error';
type LogAction = 'start_scan' | 'scan_complete' | 'start_bot' | 'stop_bot' |
                'reddit_auth_attempt' | 'reddit_auth_success' | 'reddit_auth_error' | 'reddit_auth_retry' |
                'reddit_api_request' | 'reddit_api_success' | 'reddit_api_error' | 'reddit_api_retry' |
                'check_subreddit_access' | 'subreddit_access_error' |
                'fetch_posts' | 'process_post' | 
                'keyword_check' | 'keyword_match' |
                'gemini_api_error' | 'fallback_keyword_matching' | 
                'send_message' | 'rate_limit';

interface LogFilters {
  config_id?: string;
  action?: LogAction | LogAction[];
  status?: LogLevel | LogLevel[];
  subreddit?: string;
  recipient?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

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

// POST handler for creating a new log entry
export async function POST(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the request body
    const {
      action, 
      status, 
      subreddit,
      recipient,
      message_template,
      config_id
    } = await req.json();

    // Validate the required fields
    if (!action || !status || !subreddit) {
      return NextResponse.json(
        { error: 'Action, status, and subreddit are required' },
        { status: 400 }
      );
    }

    // Get account_id from headers and handle 'undefined' string properly
    const accountIdHeader = req.headers.get('x-account-id');
    const accountId = accountIdHeader && accountIdHeader !== 'undefined' ? accountIdHeader : null;
    
    // Prepare the log entry data
    const logEntry = {
      user_id: userId,
      action,
      status,
      subreddit,
      recipient,
      message_template,
      account_id: accountId, // Use properly processed account_id
      created_at: new Date().toISOString(),
    };
    
    try {
      // Try to insert with config_id if provided
      if (config_id) {
        try {
          const { data, error } = await supabaseAdmin
            .from('bot_logs')
            .insert([{ ...logEntry, config_id }])
            .select();
            
          if (!error) {
            return NextResponse.json({ success: true, data });
          }
          
          // If there's an error about config_id, fall back to inserting without it
          if (error.message.includes('config_id')) {
            console.warn('config_id column not found, inserting without it');
          } else {
            throw error;
          }
        } catch (configIdError) {
          console.error('Error inserting with config_id:', configIdError);
          // Continue to fallback without config_id
        }
      }
      
      // Insert without config_id (either as fallback or primary approach)
      const { data, error } = await supabaseAdmin
        .from('bot_logs')
        .insert([logEntry])
        .select();
        
      if (error) {
        throw error;
      }
      
      return NextResponse.json({ success: true, data });
    } catch (dbError) {
      console.error('Error creating log entry:', dbError);
      return NextResponse.json(
        { error: `Database error: ${dbError instanceof Error ? dbError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// GET handler for retrieving log entries with enhanced filtering
export async function GET(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    // Extract all possible filter parameters
    const filters: LogFilters = {
      config_id: url.searchParams.get('config_id') || undefined,
      subreddit: url.searchParams.get('subreddit') || undefined,
      recipient: url.searchParams.get('recipient') || undefined,
      from_date: url.searchParams.get('from_date') || undefined,
      to_date: url.searchParams.get('to_date') || undefined,
      limit,
      offset
    };
    
    // Handle action filter (can be multiple)
    const actionParam = url.searchParams.get('action');
    if (actionParam) {
      filters.action = actionParam.split(',') as LogAction[];
    }
    
    // Handle status filter (can be multiple)
    const statusParam = url.searchParams.get('status');
    if (statusParam) {
      filters.status = statusParam.split(',') as LogLevel[];
    }
    
    console.log('Fetching logs with filters:', filters);
    
    // Log more details about the request
    console.log(`User ID: ${userId}`);
    console.log(`Request URL: ${req.url}`);
    console.log(`Config ID filter: ${filters.config_id || 'none'}`);
    
    // Start building the query
    let query = supabaseAdmin
      .from('bot_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    // Apply all filters
    if (filters.config_id) {
      console.log(`Filtering by config_id: ${filters.config_id}`);
      query = query.eq('config_id', filters.config_id);
    }
    
    if (filters.subreddit) {
      query = query.eq('subreddit', filters.subreddit);
    }
    
    if (filters.recipient) {
      query = query.eq('recipient', filters.recipient);
    }
    
    // Handle date range filters
    if (filters.from_date) {
      query = query.gte('created_at', filters.from_date);
    }
    
    if (filters.to_date) {
      query = query.lte('created_at', filters.to_date);
    }
    
    // Handle action filter (can be multiple)
    if (filters.action) {
      if (Array.isArray(filters.action) && filters.action.length > 0) {
        query = query.in('action', filters.action);
      } else if (typeof filters.action === 'string') {
        query = query.eq('action', filters.action);
      }
    }
    
    // Handle status filter (can be multiple)
    if (filters.status) {
      if (Array.isArray(filters.status) && filters.status.length > 0) {
        query = query.in('status', filters.status);
      } else if (typeof filters.status === 'string') {
        query = query.eq('status', filters.status);
      }
    }
    
    // Apply pagination
    console.log(`Applying pagination: offset=${offset}, limit=${limit}`);
    const { data, error, count } = await query
      .range(offset, offset + limit - 1);
      
    console.log(`Query result: ${data?.length || 0} logs found, total count: ${count || 0}`);

    if (error) {
      console.error('Error fetching log entries:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    // Group logs by action for better organization
    const groupedLogs = data?.reduce((groups: Record<string, any[]>, log) => {
      const action = log.action || 'unknown';
      if (!groups[action]) {
        groups[action] = [];
      }
      groups[action].push(log);
      return groups;
    }, {});
    
    // Log the grouped results
    console.log('Grouped logs by action:');
    if (groupedLogs) {
      Object.keys(groupedLogs).forEach(action => {
        console.log(`  - ${action}: ${groupedLogs[action].length} logs`);
      });
    } else {
      console.log('  No logs found to group');
    }

    return NextResponse.json({ 
      logs: data, 
      groupedLogs,
      count,
      filters
    });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}