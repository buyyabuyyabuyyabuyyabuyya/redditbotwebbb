// Custom Reddit service to replace Beno discussions API

export interface RedditDiscussion {
  id: string;
  title: string;
  content: string;
  description: string;
  url: string;
  subreddit: string;
  author: string;
  score: number;
  num_comments: number;
  created_utc: number;
  raw_comment: string;
}

export interface RedditDiscussionsResponse {
  items: RedditDiscussion[];
  total: number;
}

export async function getRedditDiscussions(
  query: string,
  subreddit: string = 'all',
  limit: number = 10
): Promise<RedditDiscussionsResponse> {
  // Make direct client-side request to Reddit to bypass server-side blocking
  const redditUrl = `https://old.reddit.com/r/${subreddit}/hot.json?limit=${limit}`;
  
  const response = await fetch(redditUrl, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Reddit discussions: ${response.status}`);
  }
  
  const data = await response.json();
  
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
      description: post.data.selftext || post.data.title,
      url: `https://reddit.com${post.data.permalink}`,
      subreddit: post.data.subreddit,
      author: post.data.author,
      score: post.data.score,
      num_comments: post.data.num_comments,
      created_utc: post.data.created_utc,
      raw_comment: post.data.selftext || post.data.title
    })) || [];
  
  return {
    items: discussions,
    total: discussions.length
  };
}

// Generate search queries based on product description and segments
export function generateRedditSearchQueries(description: string, segments: string[]): string[] {
  const queries: string[] = [];
  
  // Extract key terms from description
  const descriptionWords = description.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !['this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'were', 'said', 'each', 'which', 'their', 'time', 'more', 'very', 'what', 'know', 'just', 'first', 'into', 'over', 'think', 'also', 'your', 'work', 'life', 'only', 'new', 'years', 'way', 'may', 'say', 'come', 'its', 'now', 'find', 'long', 'down', 'day', 'did', 'get', 'has', 'him', 'his', 'how', 'man', 'old', 'see', 'two', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'].includes(word));
  
  // Take top keywords
  const keywords = descriptionWords.slice(0, 5);
  
  // Add basic queries
  queries.push(...keywords);
  
  // Add segment-based queries
  segments.forEach(segment => {
    queries.push(segment.toLowerCase());
    // Combine segment with main keywords
    keywords.slice(0, 2).forEach(keyword => {
      queries.push(`${segment.toLowerCase()} ${keyword}`);
    });
  });
  
  return queries.slice(0, 8); // Limit to avoid too many API calls
}

// Search multiple subreddits relevant to business/marketing
export const BUSINESS_SUBREDDITS = [
  'entrepreneur',
  'startups', 
  'smallbusiness',
  'marketing',
  'business',
  'SaaS',
  'productivity',
  'freelance',
  'webdev',
  'technology'
];

export async function searchMultipleSubreddits(
  query: string,
  subreddits: string[] = BUSINESS_SUBREDDITS,
  limitPerSubreddit: number = 5
): Promise<RedditDiscussion[]> {
  const allDiscussions: RedditDiscussion[] = [];
  
  // Search each subreddit
  for (const subreddit of subreddits.slice(0, 5)) { // Limit to 5 subreddits to avoid rate limits
    try {
      const result = await getRedditDiscussions(query, subreddit, limitPerSubreddit);
      allDiscussions.push(...result.items);
    } catch (error) {
      console.warn(`Failed to search r/${subreddit}:`, error);
    }
  }
  
  // Remove duplicates and sort by relevance (score)
  const uniqueDiscussions = allDiscussions
    .filter((discussion, index, self) => 
      index === self.findIndex(d => d.id === discussion.id)
    )
    .sort((a, b) => b.score - a.score);
  
  return uniqueDiscussions.slice(0, 20); // Return top 20 results
}
