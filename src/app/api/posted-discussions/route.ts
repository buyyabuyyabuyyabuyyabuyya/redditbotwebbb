import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const websiteConfigId = searchParams.get('website_config_id');

    switch (action) {
      case 'stats':
        // Get posting statistics
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data: todayPosts } = await supabase
          .from('posted_reddit_discussions')
          .select('id')
          .eq('user_id', userId)
          .gte('created_at', today.toISOString());

        const { data: totalPosts } = await supabase
          .from('posted_reddit_discussions')
          .select('id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);

        return NextResponse.json({
          postsToday: todayPosts?.length || 0,
          totalPosts: totalPosts?.length || 0,
          lastPostTime: totalPosts?.[0]?.created_at || null
        });

      case 'list':
        // Get list of posted discussions
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        let query = supabase
          .from('posted_reddit_discussions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (websiteConfigId) {
          query = query.eq('website_config_id', websiteConfigId);
        }

        const { data: posts, error } = await query;

        if (error) {
          console.error('Error fetching posted discussions:', error);
          return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        return NextResponse.json({ posts: posts || [] });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Posted discussions API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { 
      website_config_id, 
      reddit_post_id, 
      subreddit, 
      post_title, 
      comment_posted,
      relevance_score 
    } = body;

    if (!website_config_id || !reddit_post_id || !subreddit) {
      return NextResponse.json({ 
        error: 'Missing required fields: website_config_id, reddit_post_id, subreddit' 
      }, { status: 400 });
    }

    // Check if this discussion was already posted to for this website config
    const { data: existing } = await supabase
      .from('posted_reddit_discussions')
      .select('id')
      .eq('website_config_id', website_config_id)
      .eq('reddit_post_id', reddit_post_id)
      .single();

    if (existing) {
      return NextResponse.json({ 
        error: 'Discussion already posted to for this website configuration' 
      }, { status: 409 });
    }

    // Insert new posted discussion record
    const { data, error } = await supabase
      .from('posted_reddit_discussions')
      .insert({
        user_id: userId,
        website_config_id,
        reddit_post_id,
        subreddit,
        post_title: post_title || '',
        comment_posted: comment_posted || '',
        relevance_score: relevance_score || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting posted discussion:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });

  } catch (error) {
    console.error('Posted discussions API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const websiteConfigId = searchParams.get('website_config_id');

    if (id) {
      // Delete specific posted discussion
      const { error } = await supabase
        .from('posted_reddit_discussions')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting posted discussion:', error);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    } else if (websiteConfigId) {
      // Delete all posted discussions for a website config
      const { error } = await supabase
        .from('posted_reddit_discussions')
        .delete()
        .eq('website_config_id', websiteConfigId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting posted discussions for website config:', error);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Missing id or website_config_id parameter' }, { status: 400 });
    }

  } catch (error) {
    console.error('Posted discussions API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
