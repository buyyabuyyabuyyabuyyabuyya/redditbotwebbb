import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';

// Create a direct admin client that bypasses RLS
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

// GET handler for fetching a specific scan config
export async function GET(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the config ID from the query string
    const url = new URL(req.url);
    const configId = url.searchParams.get('id');

    if (!configId) {
      return NextResponse.json(
        { error: 'Config ID is required' },
        { status: 400 }
      );
    }

    // Get the config using admin client
    const { data, error } = await supabaseAdmin
      .from('scan_configs')
      .select('*')
      .eq('id', configId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// PUT handler for updating a scan configuration
export async function PUT(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the request body
    const {
      id,
      subreddit,
      keywords,
      messageTemplateId,
      redditAccountId,
      scanInterval,
      useAiCheck,
    } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Config ID is required' },
        { status: 400 }
      );
    }

    // Update the config
    const { data, error } = await supabaseAdmin
      .from('scan_configs')
      .update({
        subreddit,
        keywords,
        message_template_id: messageTemplateId,
        reddit_account_id: redditAccountId,
        scan_interval: scanInterval,
        use_ai_check: useAiCheck,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the update
    await supabaseAdmin.from('bot_logs').insert([
      {
        user_id: userId,
        action: 'update_bot',
        status: 'success',
        config_id: id,
        subreddit,
        created_at: new Date().toISOString(),
      },
    ]);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// DELETE handler for deleting a scan configuration
export async function DELETE(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the config ID from the query string
    const url = new URL(req.url);
    const configId = url.searchParams.get('id');

    if (!configId) {
      return NextResponse.json(
        { error: 'Config ID is required' },
        { status: 400 }
      );
    }

    // Delete the config
    const { error } = await supabaseAdmin
      .from('scan_configs')
      .delete()
      .eq('id', configId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the deletion
    await supabaseAdmin.from('bot_logs').insert([
      {
        user_id: userId,
        action: 'delete_bot',
        status: 'success',
        config_id: configId,
        created_at: new Date().toISOString(),
      },
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
