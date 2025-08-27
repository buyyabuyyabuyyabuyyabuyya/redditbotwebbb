import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
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

    // Get a valid Reddit account for discussion posting
    const { data: account } = await supabaseAdmin
      .from('reddit_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('is_discussion_poster', true)
      .eq('is_validated', true)
      .limit(1)
      .single();

    if (!account) {
      return NextResponse.json({ 
        error: 'No valid Reddit discussion poster account found. Please add a Reddit account with discussion posting enabled.' 
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      accountId: account.id
    });

  } catch (error) {
    console.error('Error fetching discussion poster account:', error);
    return NextResponse.json({ 
      error: 'Server error' 
    }, { status: 500 });
  }
}
