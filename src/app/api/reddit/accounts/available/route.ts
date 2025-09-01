import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Get all admin-controlled Reddit accounts for discussion posting
    // Only accounts with is_discussion_poster=true (set by admin) are returned
    // Hide sensitive credentials from users
    const { data: accounts } = await supabaseAdmin
      .from('reddit_accounts')
      .select('id, username, is_validated, is_discussion_poster, status, is_available, total_posts_made, last_used_at')
      .eq('is_discussion_poster', true)
      .eq('is_validated', true);

    return NextResponse.json({ accounts: accounts || [] });

  } catch (error) {
    console.error('Available accounts API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Users cannot modify Reddit accounts - only admin controls which accounts are used
    return NextResponse.json({ error: 'Account management is admin-only' }, { status: 403 });

  } catch (error) {
    console.error('Available accounts API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
