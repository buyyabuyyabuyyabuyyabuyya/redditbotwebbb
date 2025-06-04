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

export async function GET() {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all API keys
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('*')
      .eq('provider', 'gemini')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error fetching API keys:', error);
      return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
    }

    // Process keys to show only first 10 digits
    const processedData = data.map(key => ({
      id: key.id,
      key_preview: key.key.substring(0, 10) + '...',
      is_active: key.is_active,
      provider: key.provider,
      usage_count: key.usage_count,
      error_count: key.error_count,
      last_used: key.last_used,
      rate_limit_reset: key.rate_limit_reset,
      created_at: key.created_at,
      updated_at: key.updated_at
    }));

    return NextResponse.json({ 
      message: "API keys retrieved successfully",
      keys: processedData,
      total: data.length
    });
    
  } catch (error: any) {
    console.error('Error in show-keys route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
