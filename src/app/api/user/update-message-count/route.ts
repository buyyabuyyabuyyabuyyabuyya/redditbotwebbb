import { NextResponse } from 'next/server';
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
 * Endpoint to synchronize message_count in users table with actual count from sent_messages
 * 
 * This can be called periodically or after batch operations to ensure the message_count
 * field is in sync with the actual number of messages sent.
 */
export async function POST(req: Request) {
  try {
    // Get the userId from the request body
    const { userId } = await req.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Get the actual count from sent_messages table
    const { count: actualCount, error: countError } = await supabaseAdmin
      .from('sent_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (countError) {
      console.error('Error counting messages:', countError);
      return NextResponse.json(
        { error: `Database error: ${countError.message}` },
        { status: 500 }
      );
    }
    
    // Update the user's message_count field to match the actual count
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from('users')
      .update({ message_count: actualCount || 0 })
      .eq('id', userId)
      .select();
      
    if (updateError) {
      console.error('Error updating message count:', updateError);
      return NextResponse.json(
        { error: `Database error: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message_count: actualCount || 0,
      updated: true
    });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}