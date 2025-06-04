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

// GET handler for retrieving messages or message count
export async function GET(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const url = new URL(req.url);
    const subreddit = url.searchParams.get('subreddit');
    const countOnly = url.searchParams.get('count') === 'true';
    
    // If count only, return the count
    if (countOnly) {
      let countQuery = supabaseAdmin.from('sent_messages').select('*', { count: 'exact', head: true });
      
      // Apply filters
      countQuery = countQuery.eq('user_id', userId);
      
      // Add subreddit filter if provided
      if (subreddit) {
        countQuery = countQuery.eq('subreddit', subreddit);
      }
      
      const { count, error } = await countQuery;
      
      if (error) {
        console.error('Error counting messages:', error);
        return NextResponse.json(
          { error: `Database error: ${error.message}` },
          { status: 500 }
        );
      }
      
      return NextResponse.json({ count });
    } 
    // Otherwise, return the messages
    else {
      let dataQuery = supabaseAdmin.from('sent_messages').select('*');
      
      // Apply filters
      dataQuery = dataQuery.eq('user_id', userId);
      
      // Add subreddit filter if provided
      if (subreddit) {
        dataQuery = dataQuery.eq('subreddit', subreddit);
      }
      
      // Order by created_at
      dataQuery = dataQuery.order('created_at', { ascending: false });
      
      const { data, error } = await dataQuery;
      
      if (error) {
        console.error('Error fetching messages:', error);
        return NextResponse.json(
          { error: `Database error: ${error.message}` },
          { status: 500 }
        );
      }
      
      return NextResponse.json({ messages: data });
    }
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}