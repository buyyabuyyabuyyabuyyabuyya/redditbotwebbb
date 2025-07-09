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
      persistSession: false,
    },
  }
);
//went back to push to this version
// POST handler for creating a new Reddit account
export async function POST(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the request body
    const { username, password, clientId, clientSecret } = await req.json();

    // Validate the required fields
    if (!username || !password || !clientId || !clientSecret) {
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
            user_id: userId, // Set both id and user_id to the Clerk userId
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

    // ---- PLAN LIMIT CHECK ----
    // Get user's current plan
    const { data: userRecord } = await supabaseAdmin
      .from('users')
      .select('subscription_status')
      .eq('id', userId)
      .single();

    const plan = (userRecord?.subscription_status || 'free') as any;
    const limits = getPlanLimits(plan);

    // Count existing Reddit accounts for this user
    const { count: accountCount } = await supabaseAdmin
      .from('reddit_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (
      limits.maxAccounts !== null &&
      (accountCount || 0) >= limits.maxAccounts
    ) {
      return NextResponse.json(
        {
          error:
            'Reddit account limit reached for your current subscription. Please upgrade your plan to add more accounts.',
        },
        { status: 403 }
      );
    }

    // Now insert the Reddit account (the foreign key constraint should be satisfied)
    const { data, error } = await supabaseAdmin
      .from('reddit_accounts')
      .insert([
        {
          user_id: userId,
          username,
          password,
          client_id: clientId,
          client_secret: clientSecret,
          is_validated: true,
        },
      ])
      .select();

    if (error) {
      console.error('Error saving Reddit account:', error);
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

// GET handler for retrieving Reddit accounts for a user
export async function GET(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const url = new URL(req.url);
    const accountId = url.searchParams.get('id');
    const includeCredentials = url.searchParams.get('credentials') === 'true';

    // If accountId is provided, get a specific account
    if (accountId) {
      // Determine which fields to select based on whether credentials are requested
      let selectFields = 'id, username, is_validated';
      if (includeCredentials) {
        selectFields = '*'; // Include all fields including password, client_id, client_secret
      }

      const { data, error } = await supabaseAdmin
        .from('reddit_accounts')
        .select(selectFields)
        .eq('id', accountId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Record not found
          return NextResponse.json(
            { error: 'Reddit account not found' },
            { status: 404 }
          );
        }

        console.error('Error retrieving Reddit account:', error);
        return NextResponse.json(
          { error: `Database error: ${error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ account: data });
    }

    // Otherwise, get all Reddit accounts for the authenticated user (without sensitive credentials)
    const { data, error } = await supabaseAdmin
      .from('reddit_accounts')
      .select('id, username, is_validated')
      .eq('user_id', userId);

    if (error) {
      console.error('Error retrieving Reddit accounts:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ accounts: data });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// ------------------------------------------------------------
// PUT handler: Update an existing Reddit account record
// ------------------------------------------------------------
export async function PUT(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const accountId = url.searchParams.get('id');
    if (!accountId) {
      return NextResponse.json({ error: 'Missing account id' }, { status: 400 });
    }

    // Parse body
    const { username, password, clientId, clientSecret } = await req.json();

    const updates: Record<string, any> = {};
    if (username !== undefined) updates.username = username;
    if (password !== undefined) updates.password = password;
    if (clientId !== undefined) updates.client_id = clientId;
    if (clientSecret !== undefined) updates.client_secret = clientSecret;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('reddit_accounts')
      .update(updates)
      .eq('id', accountId)
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('Error updating Reddit account:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, account: data?.[0] ?? null });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// ------------------------------------------------------------
// DELETE handler: Remove a Reddit account
// ------------------------------------------------------------
export async function DELETE(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const accountId = url.searchParams.get('id');
    if (!accountId) {
      return NextResponse.json({ error: 'Missing account id' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('reddit_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting Reddit account:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
