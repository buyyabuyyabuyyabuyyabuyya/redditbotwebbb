import { NextResponse } from 'next/server';
import { redditReplyService } from '../../../../lib/redditReplyService';
import { PublishReplyRequest } from '../../../../types/beno-workflow';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const body: PublishReplyRequest = await req.json();
    console.log('[reply route] incoming', body);
    
    // Get a valid Reddit account for discussion posting
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { data: account } = await supabaseAdmin
      .from('reddit_accounts')
      .select('id')
      .eq('user_id', body.user_id)
      .eq('is_discussion_poster', true)
      .eq('is_validated', true)
      .limit(1)
      .single();

    if (!account) {
      return NextResponse.json({ 
        error: 'No valid Reddit discussion poster account found. Please add a Reddit account with discussion posting enabled.' 
      }, { status: 404 });
    }
    
    // Convert the request to the format expected by redditReplyService
    const post = {
      id: body.post_url.split('/').pop() || '',
      title: 'Post', // We don't have the title in the request
      selftext: '',
      subreddit: body.post_url.includes('/r/') ? body.post_url.split('/r/')[1].split('/')[0] : '',
      score: 0,
      url: body.post_url,
      permalink: body.post_url
    };

    const result = await redditReplyService.postComment(
      post,
      body.comment_text,
      account.id, // Use the actual Reddit account ID
      body.user_id
    );

    if (result.success) {
      const data = {
        status: 'success',
        commentId: result.commentId,
        commentUrl: result.commentUrl
      };
      console.log('[reply route] success', data);
      return NextResponse.json(data);
    } else {
      throw new Error(result.error || 'Failed to post comment');
    }
  } catch (error) {
    console.error('[reply route] error', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
