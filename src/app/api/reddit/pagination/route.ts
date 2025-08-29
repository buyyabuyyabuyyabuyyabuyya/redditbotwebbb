import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { RedditPaginationManager } from '../../../../lib/redditPagination';

export async function GET(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const subreddit = searchParams.get('subreddit');

    const paginationManager = new RedditPaginationManager(userId);

    switch (action) {
      case 'get':
        if (!subreddit) {
          return NextResponse.json({ error: 'Subreddit is required' }, { status: 400 });
        }
        const state = await paginationManager.getPaginationState(subreddit);
        return NextResponse.json({ state });

      case 'all':
        const allStates = await paginationManager.getAllPaginationStates();
        return NextResponse.json({ states: allStates });

      case 'stats':
        const stats = await paginationManager.getPaginationStats();
        return NextResponse.json(stats);

      case 'cleanup':
        const cleanupSuccess = await paginationManager.cleanupOldStates();
        return NextResponse.json({ success: cleanupSuccess });

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
    const { action, subreddit, after, before, incrementFetched } = body;

    if (!subreddit) {
      return NextResponse.json({ error: 'Subreddit is required' }, { status: 400 });
    }

    const paginationManager = new RedditPaginationManager(userId);

    switch (action) {
      case 'update':
        const updateSuccess = await paginationManager.updatePaginationState(
          subreddit,
          after || null,
          before || null,
          incrementFetched || 0
        );
        return NextResponse.json({ success: updateSuccess });

      case 'reset':
        const resetSuccess = await paginationManager.resetPaginationState(subreddit);
        return NextResponse.json({ success: resetSuccess });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Pagination API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
