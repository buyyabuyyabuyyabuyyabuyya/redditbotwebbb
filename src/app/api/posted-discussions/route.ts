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
          .gte('created_at', today.toISOString());

        const { data: totalPosts } = await supabase
          .from('posted_reddit_discussions')
          .select('id, created_at')
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

        // First, verify access to the specific config OR get all allowed configs
        if (websiteConfigId) {
          const { data: config } = await supabase
            .from('website_configs')
            .select('id')
            .eq('id', websiteConfigId)
            .eq('user_id', userId)
            .single();

          if (!config) {
            return NextResponse.json({ error: 'Website configuration not found or unauthorized' }, { status: 404 });
          }
        }

        let query = supabase
          .from('posted_reddit_discussions')
          .select(`
            *,
            website_configs!inner(user_id)
          `)
          .eq('website_configs.user_id', userId)
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

        // Clean up internal join data before returning
        const cleanedPosts = (posts || []).map(p => {
          const { website_configs, ...rest } = p as any;
          return rest;
        });

        return NextResponse.json({ posts: cleanedPosts });

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

    // Verify ownership of the website config
    const { data: config } = await supabase
      .from('website_configs')
      .select('id')
      .eq('id', website_config_id)
      .eq('user_id', userId)
      .single();

    if (!config) {
      return NextResponse.json({ error: 'Website configuration not found or unauthorized' }, { status: 404 });
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
        website_config_id,
        reddit_post_id,
        subreddit,
        post_title: post_title || '',
        comment_text: comment_posted || '', // Fixed column name
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
      // Delete specific posted discussion - must verify ownership via join
      const { data: post } = await supabase
        .from('posted_reddit_discussions')
        .select('id, website_configs!inner(user_id)')
        .eq('id', id)
        .eq('website_configs.user_id', userId)
        .single();

      if (!post) {
        return NextResponse.json({ error: 'Post not found or unauthorized' }, { status: 404 });
      }

      const { error } = await supabase
        .from('posted_reddit_discussions')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting posted discussion:', error);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    } else if (websiteConfigId) {
      // First verify ownership of the config
      const { data: config } = await supabase
        .from('website_configs')
        .select('id')
        .eq('id', websiteConfigId)
        .eq('user_id', userId)
        .single();

      if (!config) {
        return NextResponse.json({ error: 'Website configuration not found or unauthorized' }, { status: 404 });
      }

      // Delete all posted discussions for a website config
      const { error } = await supabase
        .from('posted_reddit_discussions')
        .delete()
        .eq('website_config_id', websiteConfigId);

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
