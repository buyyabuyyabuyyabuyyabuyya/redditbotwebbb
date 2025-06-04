import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerSupabaseClient } from '../../../../utils/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { getPlanLimits } from '../../../../utils/planLimits';

// Create a Supabase admin client with service role key for bypassing RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// POST handler for creating a new scan configuration
export async function POST(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the request body
    const { 
      subreddit, 
      keywords, 
      messageTemplateId, 
      redditAccountId, 
      scanInterval,
      isActive,
      useAiCheck 
    } = await req.json();

    // Validate the required fields
    if (!subreddit || !keywords || !messageTemplateId || !redditAccountId) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // First, check if the user exists in the users table
    const { data: existingUser, error: userCheckError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    // If user doesn't exist in Supabase yet, create them
    if (!existingUser) {
      console.log(`User ${userId} not found in users table, creating...`);
      
      const { error: createUserError } = await supabaseAdmin
        .from('users')
        .insert([
          {
            id: userId,
            user_id: userId,  // Set both id and user_id to the Clerk userId
            subscription_status: 'free',
            message_count: 0,
            created_at: new Date().toISOString(),
          },
        ]);

      if (createUserError) {
        console.error('Error creating user in Supabase:', createUserError);
        return NextResponse.json(
          { error: `Failed to create user: ${createUserError.message}` },
          { status: 500 }
        );
      }
    }

    // ---- PLAN LIMIT CHECK BEFORE INSERT ----
    const { data: userRecord } = await supabaseAdmin
      .from('users')
      .select('subscription_status')
      .eq('id', userId)
      .single();
    const plan = (userRecord?.subscription_status || 'free') as any;
    const limits = getPlanLimits(plan);

    const { count: configCount } = await supabaseAdmin
      .from('scan_configs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (limits.maxScanConfigs !== null && (configCount || 0) >= limits.maxScanConfigs) {
      return NextResponse.json(
        {
          error:
            'Scan configuration limit reached for your current plan. Please upgrade your plan to add more scan configs.',
        },
        { status: 403 }
      );
    }

    // Now insert the scan config
    const { data, error } = await supabaseAdmin
      .from('scan_configs')
      .insert([
        {
          user_id: userId,
          subreddit,
          keywords,
          message_template_id: messageTemplateId,
          reddit_account_id: redditAccountId,
          scan_interval: scanInterval,
          is_active: isActive || false,
          use_ai_check: useAiCheck !== undefined ? useAiCheck : true, // Default to true if not specified
        },
      ])
      .select();

    if (error) {
      console.error('Error creating scan config:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// GET handler for retrieving scan configs for a user
export async function GET(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const url = new URL(req.url);
    const configId = url.searchParams.get('id');
    
    console.log(`GET scan-config request with userId: ${userId}, configId: ${configId}`);

    // If config ID is provided, get a specific config
    if (configId) {
      console.log(`Looking up specific config with ID: ${configId}`);
      
      // First check if the config exists at all (without user_id filter)
      const { data: rawCheck, error: rawCheckError } = await supabaseAdmin
        .from('scan_configs')
        .select('id, user_id, subreddit')
        .eq('id', configId);
        
      if (rawCheckError) {
        console.error(`Raw check error: ${JSON.stringify(rawCheckError)}`);
      } else {
        console.log(`Raw check found ${rawCheck?.length || 0} configs:`);
        console.log(JSON.stringify(rawCheck, null, 2));
      }
      
      // Now get the config with user_id filter
      const { data, error } = await supabaseAdmin
        .from('scan_configs')
        .select('*')
        .eq('id', configId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // Record not found
          console.error(`Config not found for ID ${configId} and user ${userId}`);
          return NextResponse.json(
            { error: 'Configuration not found' },
            { status: 404 }
          );
        }
        
        console.error(`Error retrieving scan config: ${JSON.stringify(error)}`);
        return NextResponse.json(
          { error: `Database error: ${error.message}` },
          { status: 500 }
        );
      }
      
      console.log(`Successfully found config for ID ${configId}:`);
      console.log(JSON.stringify(data, null, 2));

      return NextResponse.json({ config: data });
    }
    
    // Otherwise, get all scan configs for the authenticated user
    const { data, error } = await supabaseAdmin
      .from('scan_configs')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Error retrieving scan configs:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ configs: data });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// PATCH handler for toggling a scan configuration's active status
export async function PATCH(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the request body
    const { configId, isActive } = await req.json();

    // Validate the required fields
    if (!configId) {
      return NextResponse.json(
        { error: 'Config ID is required' },
        { status: 400 }
      );
    }

    // Check if the config belongs to the user
    const { data: existingConfig, error: configCheckError } = await supabaseAdmin
      .from('scan_configs')
      .select('id')
      .eq('id', configId)
      .eq('user_id', userId)
      .single();

    if (configCheckError || !existingConfig) {
      return NextResponse.json(
        { error: 'Configuration not found or access denied' },
        { status: 404 }
      );
    }

    // Update the scan config's active status
    const { data, error } = await supabaseAdmin
      .from('scan_configs')
      .update({ is_active: isActive })
      .eq('id', configId)
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('Error updating scan config:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data,
      message: `Bot ${isActive ? 'started' : 'stopped'} successfully` 
    });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}