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

// GET handler for retrieving API keys (admin only)
export async function GET(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !userData?.is_admin) {
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // Get all API keys
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching API keys:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    // Mask the actual API keys for security
    const maskedData = data.map((key) => ({
      ...key,
      key: `${key.key.substring(0, 8)}...${key.key.substring(key.key.length - 4)}`,
    }));

    return NextResponse.json({ keys: maskedData });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// POST handler for adding a new API key
export async function POST(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !userData?.is_admin) {
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // Parse the request body
    const {
      key,
      provider = 'groq',
      model = 'llama-3.1-8b-instant',
    } = await req.json();

    // Validate the required fields
    if (!key) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      );
    }

    // Insert the new API key
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .insert([
        {
          key,
          provider,
          model,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      console.error('Error adding API key:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    // Mask the API key in the response
    const maskedData = data.map((key) => ({
      ...key,
      key: `${key.key.substring(0, 8)}...${key.key.substring(key.key.length - 4)}`,
    }));

    return NextResponse.json({ success: true, data: maskedData });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// PATCH handler for updating an API key's status
export async function PATCH(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !userData?.is_admin) {
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // Parse the request body
    const { keyId, isActive } = await req.json();

    // Validate the required fields
    if (!keyId || isActive === undefined) {
      return NextResponse.json(
        { error: 'Key ID and isActive status are required' },
        { status: 400 }
      );
    }

    // Update the API key
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', keyId)
      .select();

    if (error) {
      console.error('Error updating API key:', error);
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

// DELETE handler for removing an API key
export async function DELETE(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !userData?.is_admin) {
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // Parse the URL to get the key ID
    const url = new URL(req.url);
    const keyId = url.searchParams.get('id');

    if (!keyId) {
      return NextResponse.json(
        { error: 'Key ID is required' },
        { status: 400 }
      );
    }

    // Delete the API key
    const { error } = await supabaseAdmin
      .from('api_keys')
      .delete()
      .eq('id', keyId);

    if (error) {
      console.error('Error deleting API key:', error);
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
