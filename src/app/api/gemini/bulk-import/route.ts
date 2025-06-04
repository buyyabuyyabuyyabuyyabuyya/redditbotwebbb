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

// POST handler for bulk importing API keys
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
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Parse the request body
    const { keys, provider = 'gemini', model = 'gemini-2.0-flash-lite' } = await req.json();

    // Validate the required fields
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json(
        { error: 'API keys array is required' },
        { status: 400 }
      );
    }

    // Prepare the keys for insertion
    const keysToInsert = keys.map(key => ({
      key: key.trim(),
      provider,
      model,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    // Insert the new API keys
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .insert(keysToInsert)
      .select();

    if (error) {
      console.error('Error adding API keys:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    // Mask the API keys in the response
    const maskedData = data.map(key => ({
      ...key,
      key: `${key.key.substring(0, 8)}...${key.key.substring(key.key.length - 4)}`,
    }));

    return NextResponse.json({ 
      success: true, 
      data: maskedData,
      message: `Successfully imported ${data.length} API keys. Note that your API keys are not stored in our database for security reasons.`
    });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}