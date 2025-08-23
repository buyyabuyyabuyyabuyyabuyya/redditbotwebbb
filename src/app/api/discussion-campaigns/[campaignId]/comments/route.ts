import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request, { params }: { params: { campaignId: string } }) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId } = params;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Get all comments for this campaign
    const { data: comments } = await supabaseAdmin
      .from('auto_posting_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('product_id', campaignId)
      .eq('status', 'posted')
      .order('posted_at', { ascending: false });

    const formattedComments = (comments || []).map(comment => ({
      id: comment.id,
      comment_url: comment.comment_url,
      reply_text: comment.reply_text,
      subreddit: comment.subreddit,
      relevance_score: comment.relevance_score || 0,
      posted_at: comment.posted_at,
      status: comment.status
    }));

    return NextResponse.json({
      success: true,
      comments: formattedComments
    });

  } catch (error) {
    console.error('Campaign comments error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
