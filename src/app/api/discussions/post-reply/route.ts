import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { callGeminiForText } from '../../../../utils/geminiTextGeneration';
import { scheduleQStashMessage } from '../../../../utils/qstash';
import snoowrap from 'snoowrap';

const createSupabaseServerClient = () => {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
};

export async function POST(req: Request) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const { discussion_id, account_id, reply_content } = await req.json();
    
    if (!discussion_id || !account_id || !reply_content) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`Posting reply to discussion: ${discussion_id}`);

    const supabase = createSupabaseServerClient();

    // Get user plan and message count
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('subscription_status, message_count')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      throw new Error('Failed to fetch user plan information');
    }

    // Check plan limits before proceeding
    if (userData.subscription_status === 'pro' && userData.message_count >= 200) {
      throw new Error('Pro plan message limit reached (200 messages/month). Please upgrade to Advanced for unlimited messages.');
    }

    if (userData.subscription_status === 'free' && userData.message_count >= 15) {
      throw new Error('Free plan message limit reached (15 messages/month). Please upgrade to Pro or Advanced for more messages.');
    }

    // Get discussion details
    const { data: discussion, error: discussionError } = await supabase
      .from('discussions')
      .select('*')
      .eq('id', discussion_id)
      .single();

    if (discussionError || !discussion) {
      throw new Error('Discussion not found');
    }

    // Verify ownership through product
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('user_id')
      .eq('id', discussion.product_id)
      .eq('user_id', userId)
      .single();

    if (productError || !product) {
      throw new Error('Access denied: Discussion not owned by user');
    }

    // Get Reddit account details
    const { data: redditAccount, error: accountError } = await supabase
      .from('reddit_accounts')
      .select('*')
      .eq('id', account_id)
      .eq('user_id', userId)
      .eq('is_discussion_poster', true)
      .eq('is_validated', true)
      .single();

    if (accountError || !redditAccount) {
      throw new Error('Reddit account not found or not authorized for discussion posting');
    }

    // Create Reddit client
    const reddit = new snoowrap({
      userAgent: 'RedditOutreach/1.0 (Discussion Reply)',
      clientId: process.env.REDDIT_CLIENT_ID,
      clientSecret: process.env.REDDIT_CLIENT_SECRET,
      refreshToken: redditAccount.refresh_token,
    });

    try {
      // Post reply to Reddit - handle type issues with explicit error handling
      let commentId = 'unknown';
      try {
        const submission = reddit.getSubmission(discussion.post_id);
        // @ts-ignore - Snoowrap type definition issue
        const comment = await submission.reply(reply_content);
        commentId = comment.id;
        console.log('Comment ID:', commentId);
      } catch (replyError) {
        throw new Error(`Failed to post reply: ${replyError instanceof Error ? replyError.message : 'Unknown error'}`);
      }
      
      // Update discussion status to 'replied'
      const { error: updateDiscussionError } = await supabase
        .from('discussions')
        .update({ status: 'replied' })
        .eq('id', discussion_id);

      if (updateDiscussionError) {
        console.error('Error updating discussion status:', updateDiscussionError);
      }

      // Create discussion reply record
      const { error: replyError } = await supabase
        .from('discussion_replies')
        .insert({
          discussion_id,
          reddit_account_id: account_id,
          reply_content,
          reddit_comment_id: commentId,
          status: 'posted',
          posted_at: new Date().toISOString()
        });

      if (replyError) {
        console.error('Error creating reply record:', replyError);
      }

      // Increment user message count
      const { error: messageCountError } = await supabase
        .from('users')
        .update({ message_count: userData.message_count + 1 })
        .eq('id', userId);

      if (messageCountError) {
        console.error('Error updating message count:', messageCountError);
      }

      console.log(`Successfully posted reply to discussion: ${discussion_id}`);

      const response = {
        success: true,
        comment_id: commentId,
        message: 'Reply posted successfully to Reddit discussion'
      };

      return NextResponse.json(response);

    } catch (redditError) {
      console.error('Reddit API error:', redditError);
      
      // Update discussion reply status to 'failed'
      await supabase
        .from('discussion_replies')
        .insert({
          discussion_id,
          reddit_account_id: account_id,
          reply_content,
          status: 'failed',
          error_message: redditError instanceof Error ? redditError.message : 'Unknown Reddit API error'
        });

      throw new Error(`Failed to post reply to Reddit: ${redditError instanceof Error ? redditError.message : 'Unknown error'}`);
    }

  } catch (error) {
    console.error('Post reply error:', error);
    
    const response = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };

    return NextResponse.json(response, { status: 500 });
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'Discussion reply posting service is running',
    timestamp: new Date().toISOString()
  });
} 