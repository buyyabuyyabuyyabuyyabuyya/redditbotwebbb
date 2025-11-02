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
  console.log(`[REDDIT_SERVICE] Trying RSS: https://old.reddit.com/r/${subreddit}/hot.rss?limit=${limit}`);
  const rssResponse = await fetch(`https://old.reddit.com/r/${subreddit}/hot.rss?limit=${limit}`, {
    headers: {
      'Accept': 'application/rss+xml, application/xml, text/xml',
      'User-Agent': getRandomUserAgent(),
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    },
  });
  
  console.log(`[REDDIT_SERVICE] RSS Response: ${rssResponse.status}`);
  
  if (rssResponse.ok) {
    const rssText = await rssResponse.text();
    console.log(`[REDDIT_SERVICE] RSS content length: ${rssText.length} chars`);
    console.log(`[REDDIT_SERVICE] RSS sample: ${rssText.substring(0, 500)}...`);
    const discussions = parseRedditRSS(rssText, query, subreddit);
    console.log(`[REDDIT_SERVICE] RSS parsed ${discussions.length} discussions`);
    return {
      items: discussions,
      total: discussions.length
    };
  } else {
    const endpoints = [
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

  // Try HTML scraping as final fallback
  try {
    console.log(`[REDDIT_SERVICE] Trying HTML scraping: https://old.reddit.com/r/${subreddit}/hot`);
    const discussions = await scrapeRedditHTML(subreddit, query);
    if (discussions.length > 0) {
      console.log(`[REDDIT_SERVICE] HTML scraping found ${discussions.length} discussions`);
      return {
        items: discussions,
        total: discussions.length
      };
    }
  } catch (error) {
    console.log(`[REDDIT_SERVICE] HTML scraping failed:`, error);
  }

  // If all methods failed, throw the last error
  throw lastError || new Error(`Failed to fetch Reddit discussions from r/${subreddit}`);
}

// HTML scraping fallback method
async function scrapeRedditHTML(subreddit: string, query: string): Promise<RedditDiscussion[]> {
  const discussions: RedditDiscussion[] = [];
  
  try {
    const response = await fetch(`https://old.reddit.com/r/${subreddit}/hot`, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    if (!response.ok) {
      throw new Error(`HTML fetch failed: ${response.status}`);
    }

    const html = await response.text();
    console.log(`[HTML_SCRAPER] Fetched HTML, length: ${html.length} chars`);

    // Extract post data from HTML using regex patterns
    const postPattern = /<div[^>]*class="[^"]*thing[^"]*"[^>]*data-fullname="([^"]*)"[^>]*>/g;
    const titlePattern = /<a[^>]*class="[^"]*title[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
    const scorePattern = /<div[^>]*class="[^"]*score[^"]*"[^>]*title="([^"]*)"[^>]*>/g;
    const authorPattern = /<a[^>]*class="[^"]*author[^"]*"[^>]*>([^<]*)<\/a>/g;

    let postMatch;
    let postIndex = 0;
    
    while ((postMatch = postPattern.exec(html)) !== null && postIndex < 25) {
      const fullname = postMatch[1];
      const postId = fullname.replace('t3_', '');
      
      // Find title for this post
      titlePattern.lastIndex = postMatch.index;
      const titleMatch = titlePattern.exec(html);
      
      if (titleMatch) {
        const url = titleMatch[1].startsWith('/') ? `https://reddit.com${titleMatch[1]}` : titleMatch[1];
        const title = titleMatch[2].trim();
        
        // Basic relevance filtering
        const titleLower = title.toLowerCase();
        const queryLower = query.toLowerCase();
        const businessKeywords = ['business', 'startup', 'entrepreneur', 'marketing', 'saas', 'platform'];
        
        const isRelevant = titleLower.includes(queryLower) || 
                          businessKeywords.some(keyword => titleLower.includes(keyword)) ||
                          query.length < 4;

        if (isRelevant) {
          discussions.push({
            id: postId,
            title: title,
            content: title, // HTML scraping doesn't get full content easily
            description: title,
            url: url,
            subreddit: subreddit,
            author: 'unknown', // Could extract but adds complexity
            score: 0, // Could extract but adds complexity
            num_comments: 0,
            created_utc: Date.now() / 1000,
            raw_comment: title,
            is_self: false
          });
        }
      }
      
      postIndex++;
    }

    console.log(`[HTML_SCRAPER] Extracted ${discussions.length} discussions from HTML`);
    return discussions;
    
  } catch (error) {
    console.log(`[HTML_SCRAPER] Error:`, error);
    throw error;
  }
}

// Parse Reddit RSS feed to extract discussions
function parseRedditRSS(rssText: string, query: string, subreddit: string): RedditDiscussion[] {
  const discussions: RedditDiscussion[] = [];
  
  try {
    console.log(`[RSS_PARSER] Parsing feed for r/${subreddit}, content length: ${rssText.length}`);
    console.log(`[RSS_PARSER] Feed sample: ${rssText.substring(0, 500)}...`);
    
    // Reddit uses Atom format with <entry> tags, not RSS <item> tags
    const entries = rssText.split('<entry>').slice(1); // Remove first empty element
    console.log(`[RSS_PARSER] Found ${entries.length} entries in feed`);
    
    for (const entryText of entries.slice(0, 25)) {
      const endIndex = entryText.indexOf('</entry>');
      const entry = endIndex > -1 ? entryText.substring(0, endIndex) : entryText;
      
      // Atom format uses different tags than RSS
      const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      const linkMatch = entry.match(/<link[^>]*href="([^"]*)"[^>]*>/);
      const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);
      const authorMatch = entry.match(/<author><name>([^<]*)<\/name><\/author>/);
      
      console.log(`[RSS_PARSER] Entry title match: ${titleMatch?.[1]?.substring(0, 100)}`);
      
      if (titleMatch && linkMatch) {
        const title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
        const url = linkMatch[1];
        const description = contentMatch?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').trim() || '';
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
    const relevantDiscussions = await filterRelevantDiscussions(unpostedDiscussions, websiteConfig);
    
    return (await relevantDiscussions).map(item => item.discussion).slice(0, 20);
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
    
    return (await relevantDiscussions).map(item => item.discussion).slice(0, 20);
  }
  
  // Fallback to original sorting if no website config
  return uniqueDiscussions
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

// Generate search queries for Reddit
export function generateRedditSearchQueries(websiteConfig: WebsiteConfig): string[] {
  const queries: string[] = [];
  
  // Add customer segments as queries
  if (websiteConfig.customer_segments) {
    queries.push(...websiteConfig.customer_segments);
  }
  
  // Add target keywords
  if (websiteConfig.target_keywords) {
    queries.push(...websiteConfig.target_keywords);
  }
  
  // Add business context terms
  if (websiteConfig.business_context_terms) {
    queries.push(...websiteConfig.business_context_terms);
  }
  
  // Fallback queries if no config
  if (queries.length === 0) {
    queries.push('business', 'startup', 'entrepreneur');
  }
  
  return queries.slice(0, 5); // Limit to 5 queries
}
