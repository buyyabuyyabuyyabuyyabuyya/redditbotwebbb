// Custom Reddit service to replace Beno discussions API
import { filterRelevantDiscussions, WebsiteConfig } from './relevanceFiltering';
import { DuplicatePostPrevention } from './duplicatePostPrevention';
import { RedditPaginationManager, buildRedditUrlWithPagination, extractPaginationTokens } from './redditPagination';

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
  is_self?: boolean;
}

export interface RedditDiscussionsResponse {
  items: RedditDiscussion[];
  total: number;
}

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

function getRandomUserAgent(): string {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

export function generateUserAgent(config?: { enabled?: boolean; type?: string; custom?: string }): string {
  if (!config?.enabled) {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }
  
  if (config.type === 'custom' && config.custom) {
    return config.custom;
  }
  
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

export async function getRedditDiscussions(
  query: string,
  subreddit: string = 'all',
  limit: number = 10
): Promise<RedditDiscussionsResponse> {
  // Try RSS feed first (less blocked), then JSON endpoints
  const endpoints = [
    { url: `https://www.reddit.com/r/${subreddit}/hot.rss?limit=${limit}`, type: 'rss' },
    { url: `https://old.reddit.com/r/${subreddit}/hot.json?limit=${limit}`, type: 'json' },
    { url: `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`, type: 'json' },
    { url: `https://reddit.com/r/${subreddit}/hot.json?limit=${limit}`, type: 'json' }
  ];

  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      console.log(`[REDDIT_SERVICE] Trying ${endpoint.type.toUpperCase()}: ${endpoint.url}`);
      
      const response = await fetch(endpoint.url, {
        headers: {
          'Accept': endpoint.type === 'rss' ? 'application/rss+xml, application/xml, text/xml' : 'application/json',
          'User-Agent': getRandomUserAgent(),
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0',
        },
      });
      
      console.log(`[REDDIT_SERVICE] ${endpoint.type.toUpperCase()} Response: ${response.status}`);
      
      if (response.ok) {
        if (endpoint.type === 'rss') {
          // Parse RSS feed
          const rssText = await response.text();
          console.log(`[REDDIT_SERVICE] RSS content length: ${rssText.length} chars`);
          console.log(`[REDDIT_SERVICE] RSS sample: ${rssText.substring(0, 500)}...`);
          const discussions = parseRedditRSS(rssText, query, subreddit);
          console.log(`[REDDIT_SERVICE] RSS parsed ${discussions.length} discussions`);
          return {
            items: discussions,
            total: discussions.length
          };
        } else {
          // Parse JSON
          const data = await response.json();
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
              raw_comment: post.data.selftext || post.data.title,
              is_self: post.data.is_self
            })) || [];
          
          return {
            items: discussions,
            total: discussions.length
          };
        }
      } else {
        lastError = new Error(`Failed to fetch from ${endpoint.url}: ${response.status}`);
        console.log(`Failed to fetch from r/${subreddit} (${endpoint.type}): ${response.status}`);
      }
    } catch (error) {
      lastError = error as Error;
      console.log(`Error fetching from ${endpoint.url}:`, error);
    }
    
    // Add delay between attempts
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // If all endpoints failed, throw the last error
  throw lastError || new Error(`Failed to fetch Reddit discussions from r/${subreddit}`);
}

// Parse Reddit RSS feed to extract discussions
function parseRedditRSS(rssText: string, query: string, subreddit: string): RedditDiscussion[] {
  const discussions: RedditDiscussion[] = [];
  
  try {
    // Split by <item> tags and process each item
    const items = rssText.split('<item>').slice(1); // Remove first empty element
    
    for (const itemText of items.slice(0, 25)) {
      const endIndex = itemText.indexOf('</item>');
      const item = endIndex > -1 ? itemText.substring(0, endIndex) : itemText;
      
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);
      const authorMatch = item.match(/<dc:creator><!\[CDATA\[\/u\/(.*?)\]\]><\/dc:creator>/);
      
      if (titleMatch && linkMatch) {
        const title = titleMatch[1];
        const url = linkMatch[1];
        const description = descMatch?.[1] || '';
        const author = authorMatch?.[1] || 'unknown';
        
        // Filter by query relevance (more lenient for RSS)
        const titleLower = title.toLowerCase();
        const descLower = description.toLowerCase();
        const queryLower = query.toLowerCase();
        
        console.log(`[RSS_PARSER] Checking post: "${title}" against query: "${query}"`);
        
        // More lenient matching for business-relevant posts
        const businessKeywords = ['business', 'startup', 'entrepreneur', 'marketing', 'saas', 'platform', 'service', 'product', 'company', 'revenue', 'growth', 'customer', 'market'];
        const isBusinessRelevant = businessKeywords.some(keyword => 
          titleLower.includes(keyword) || descLower.includes(keyword)
        );
        
        const isRelevant = titleLower.includes(queryLower) || 
                          descLower.includes(queryLower) || 
                          isBusinessRelevant || // Include business-relevant posts
                          query.length < 4; // Include all posts for short queries
        
        if (isRelevant) {
          // Extract Reddit post ID from URL
          const idMatch = url.match(/\/comments\/([a-z0-9]+)\//);
          const postId = idMatch?.[1] || Math.random().toString(36);
          
          discussions.push({
            id: postId,
            title: title,
            content: description,
            description: description,
            url: url,
            subreddit: subreddit,
            author: author,
            score: 0,
            num_comments: 0,
            created_utc: Date.now() / 1000,
            raw_comment: description || title,
            is_self: true
          });
        }
      }
    }
  } catch (error) {
    console.error('Error parsing RSS:', error);
  }
  
  return discussions;
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

export async function searchMultipleSubredditsWithPagination(
  query: string,
  userId: string,
  subreddits: string[] = BUSINESS_SUBREDDITS,
  limitPerSubreddit: number = 25,
  websiteConfig?: WebsiteConfig,
  usePagination: boolean = true
): Promise<RedditDiscussion[]> {
  const allDiscussions: RedditDiscussion[] = [];
  const paginationManager = usePagination ? new RedditPaginationManager(userId) : null;

  for (const subreddit of subreddits.slice(0, 10)) {
    try {
      let redditUrl: string;
      let paginationState = null;

      if (paginationManager) {
        // Get existing pagination state
        paginationState = await paginationManager.getPaginationState(subreddit);
        redditUrl = buildRedditUrlWithPagination(
          subreddit,
          limitPerSubreddit,
          paginationState?.after,
          null,
          'hot'
        );
      } else {
        redditUrl = `https://old.reddit.com/r/${subreddit}/hot.json?limit=${limitPerSubreddit}`;
      }

      console.log(`[REDDIT_SERVICE] Fetching URL: ${redditUrl}`);

      // Add delay to avoid aggressive rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

      const response = await fetch(redditUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'User-Agent': getRandomUserAgent(),
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0',
        },
      });

      console.log(`[REDDIT_SERVICE] Response status for r/${subreddit}: ${response.status}`);

      if (!response.ok) {
        console.warn(`Failed to fetch from r/${subreddit}: ${response.status}`);
        // For cron jobs, throw 403 errors to trigger proxy fallback
        if (response.status === 403) {
          throw new Error(`Failed to fetch from r/${subreddit}: ${response.status}`);
        }
        continue;
      }

      const data = await response.json();
      
      // Update pagination state if using pagination
      if (paginationManager && data?.data) {
        const { after, before } = extractPaginationTokens(data);
        const fetchedCount = data.data.children?.length || 0;
        await paginationManager.updatePaginationState(subreddit, after, before, fetchedCount);
      }

      // Process discussions
      const discussions = data.data?.children
        ?.filter((post: any) => {
          const title = post.data.title.toLowerCase();
          const selftext = (post.data.selftext || '').toLowerCase();
          const queryLower = query.toLowerCase();
          
          return title.includes(queryLower) || selftext.includes(queryLower);
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
          raw_comment: post.data.selftext || post.data.title,
          is_self: post.data.is_self || false,
        })) || [];

      allDiscussions.push(...discussions);
    } catch (error) {
      console.warn(`Error fetching from r/${subreddit}:`, error);
      // Re-throw 403 errors to allow cron job fallback logic
      if (error instanceof Error && error.message.includes('403')) {
        throw error;
      }
    }
  }

  // Remove duplicates
  const uniqueDiscussions = allDiscussions.filter((discussion, index, self) =>
    index === self.findIndex(d => d.id === discussion.id)
  );

  // Apply relevance filtering if website config is provided
  if (websiteConfig) {
    const duplicatePrevention = new DuplicatePostPrevention();
    
    // Filter out already posted discussions
    const unpostedDiscussions = await duplicatePrevention.filterUnpostedDiscussions(
      uniqueDiscussions, 
      websiteConfig.id
    );
    
    // Apply relevance scoring and filtering
    const relevantDiscussions = filterRelevantDiscussions(unpostedDiscussions, websiteConfig);
    
    return relevantDiscussions.map(item => item.discussion).slice(0, 20);
  }

  return uniqueDiscussions.slice(0, 50);
}

export async function searchMultipleSubreddits(
  query: string,
  subreddits: string[] = BUSINESS_SUBREDDITS,
  limitPerSubreddit: number = 25,
  websiteConfig?: WebsiteConfig
): Promise<RedditDiscussion[]> {
  const allDiscussions: RedditDiscussion[] = [];
  
  // Search each subreddit
  for (const subreddit of subreddits.slice(0, 10)) { // Limit to 10 subreddits to avoid rate limits
    try {
      const result = await getRedditDiscussions(query, subreddit, limitPerSubreddit);
      allDiscussions.push(...result.items);
    } catch (error) {
      console.warn(`Failed to search r/${subreddit}:`, error);
    }
  }
  
  // Remove duplicates
  const uniqueDiscussions = allDiscussions
    .filter((discussion, index, self) => 
      index === self.findIndex(d => d.id === discussion.id)
    );
  
  // Apply relevance filtering if website config is provided
  if (websiteConfig) {
    const duplicatePrevention = new DuplicatePostPrevention();
    
    // Filter out already posted discussions
    const unpostedDiscussions = await duplicatePrevention.filterUnpostedDiscussions(
      uniqueDiscussions, 
      websiteConfig.id
    );
    
    // Apply relevance scoring and filtering
    const relevantDiscussions = filterRelevantDiscussions(unpostedDiscussions, websiteConfig);
    
    return relevantDiscussions.map(item => item.discussion).slice(0, 20);
  }
  
  // Fallback to original sorting if no website config
  return uniqueDiscussions
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}
