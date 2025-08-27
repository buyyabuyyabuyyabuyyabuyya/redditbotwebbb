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

    // Get any admin-controlled Reddit account for discussion posting
    // These are shared accounts set by admin, not user-specific
    const { data: account, error: accountError } = await supabaseAdmin
      .from('reddit_accounts')
      .select('id, username')
      .eq('is_discussion_poster', true)
      .eq('is_validated', true)
      .limit(1)
      .single();

    console.log('Discussion poster account found:', account);
    console.log('Discussion poster query error:', accountError);

    if (!account) {
      return NextResponse.json({ 
        error: 'No admin-controlled Reddit discussion poster accounts available. Contact admin to set up discussion posting accounts.'
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
