import { NextResponse } from 'next/server';
import { redditReplyService } from '../../../../lib/redditReplyService';
import { PublishReplyRequest } from '../../../../types/beno-workflow';

export async function POST(req: Request) {
  try {
    const body: PublishReplyRequest = await req.json();
    console.log('[reply route] incoming', body);
    
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
      body.user_id, // Using user_id as accountId
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
