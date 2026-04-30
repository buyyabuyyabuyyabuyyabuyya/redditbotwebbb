import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { RedditPaginationManagerServer } from '../../../../lib/redditPaginationServer';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function getPaginationManager(userId: string, configId?: string | null) {
  return new RedditPaginationManagerServer(userId, configId || undefined);
}

export async function GET(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'get';
    const subreddit = searchParams.get('subreddit');
    const configId = searchParams.get('configId');
    const paginationManager = getPaginationManager(userId, configId);

    switch (action) {
      case 'get': {
        if (!subreddit) {
          return NextResponse.json({ error: 'Subreddit is required' }, { status: 400 });
        }
        const state = await paginationManager.getPaginationState(subreddit);
        return NextResponse.json({ state });
      }

      case 'all': {
        const states = await paginationManager.getAllPaginationStates();
        return NextResponse.json({ states });
      }

      case 'stats': {
        const states = await paginationManager.getAllPaginationStates();
        return NextResponse.json({
          totalSubreddits: states.length,
          totalPostsFetched: states.reduce(
            (sum, state) => sum + (state.total_fetched || 0),
            0
          ),
          lastActivity: states[0]?.last_fetched || null,
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Pagination API error:', error);
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
    const { action, subreddit, after, before, incrementFetched, configId } = body;

    if (!subreddit) {
      return NextResponse.json({ error: 'Subreddit is required' }, { status: 400 });
    }

    const paginationManager = getPaginationManager(userId, configId);

    switch (action) {
      case 'update': {
        const updateSuccess = await paginationManager.updatePaginationState(
          subreddit,
          after || null,
          before || null,
          incrementFetched || 0
        );
        return NextResponse.json({ success: updateSuccess });
      }

      case 'reset': {
        const resetSuccess = await paginationManager.resetPaginationState(subreddit);
        return NextResponse.json({ success: resetSuccess });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Pagination API error:', error);
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
    const configId = searchParams.get('configId');
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let query = supabaseAdmin
      .from('reddit_pagination_state')
      .delete()
      .eq('user_id', userId)
      .lt('last_fetched', cutoff);

    if (configId) {
      query = query.eq('auto_poster_config_id', configId);
    }

    const { error } = await query;

    if (error) {
      console.error('Pagination cleanup error:', error);
      return NextResponse.json({ success: false }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Pagination cleanup error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
