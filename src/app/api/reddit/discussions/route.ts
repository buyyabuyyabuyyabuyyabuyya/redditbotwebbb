import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');
    const subreddit = searchParams.get('subreddit') || 'all';
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!query) {
      return NextResponse.json({ error: 'query parameter required' }, { status: 400 });
    }

    // Use Reddit's JSON API to get hot posts (search is heavily restricted)
    const redditUrl = `https://old.reddit.com/r/${subreddit}/hot.json?limit=${limit}`;    
    const response = await fetch(redditUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

    if (!response.ok) {
      throw new Error(`Reddit API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform Reddit data to match our expected format
    // Filter posts by query relevance since we're using hot posts instead of search
    const discussions = data.data?.children
      ?.filter((post: any) => {
        const title = post.data.title.toLowerCase();
        const content = (post.data.selftext || '').toLowerCase();
        const queryLower = query.toLowerCase();
        return title.includes(queryLower) || content.includes(queryLower);
      })
      ?.map((post: any) => ({
        id: post.data.id,
        title: post.data.title,
        content: post.data.selftext || '',
        description: post.data.selftext || post.data.title, // Add description field for UI
        url: `https://reddit.com${post.data.permalink}`,
        subreddit: post.data.subreddit,
        author: post.data.author,
        score: post.data.score,
        num_comments: post.data.num_comments,
        created_utc: post.data.created_utc,
        raw_comment: post.data.selftext || post.data.title
      })) || [];

    return NextResponse.json({
      items: discussions,
      total: discussions.length
    });

  } catch (error) {
    console.error('Reddit discussions API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Reddit discussions', details: (error as Error).message },
      { status: 500 }
    );
  }
}
