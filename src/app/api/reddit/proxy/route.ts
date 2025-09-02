import { NextResponse } from 'next/server';
import { getRedditDiscussions } from '../../../../lib/redditService';

// Proxy endpoint to fetch Reddit data for cron jobs
export async function POST(req: Request) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('Authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    if (authHeader !== expectedAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query, subreddit, limit } = await req.json();

    if (!query || !subreddit) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    console.log(`[REDDIT_PROXY] Fetching r/${subreddit} with query: ${query}`);

    const discussions = await getRedditDiscussions(query, subreddit, limit || 25);

    return NextResponse.json({
      success: true,
      discussions: discussions.items,
      total: discussions.total
    });

  } catch (error) {
    console.error('[REDDIT_PROXY] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
