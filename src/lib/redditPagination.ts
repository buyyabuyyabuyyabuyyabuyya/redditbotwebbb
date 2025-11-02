// Client-side version - use API endpoints instead of direct Supabase

export interface PaginationState {
  subreddit: string;
  after: string | null;
  before: string | null;
  last_fetched: string;
  total_fetched: number;
}

export class RedditPaginationManager {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Get pagination state for a subreddit
   */
  async getPaginationState(subreddit: string): Promise<PaginationState | null> {
    try {
      const response = await fetch(`/api/reddit/pagination?userId=${this.userId}&subreddit=${subreddit}`);
      if (response.ok) {
        const data = await response.json();
        return data.state || null;
      }
    } catch (error) {
      console.error('Error in getPaginationState:', error);
    }
    return null;
  }

  /**
   * Update pagination state for a subreddit
   */
  async updatePaginationState(
    subreddit: string, 
    after: string | null, 
    before: string | null = null,
    incrementFetched: number = 0
  ): Promise<boolean> {
    try {
      const response = await fetch('/api/reddit/pagination', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          subreddit,
          after,
          before,
          incrementFetched
        })
      });
      return response.ok;
    } catch (error) {
      console.error('Error in updatePaginationState:', error);
      return false;
    }
  }

  /**
   * Reset pagination state for a subreddit (start from beginning)
   */
  async resetPaginationState(subreddit: string): Promise<boolean> {
    try {
      const response = await fetch('/api/reddit/pagination', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.userId, subreddit })
      });
      return response.ok;
    } catch (error) {
      console.error('Error in resetPaginationState:', error);
      return false;
    }
  }

  /**
   * Get all pagination states for user
   */
  async getAllPaginationStates(): Promise<PaginationState[]> {
    try {
      const response = await fetch(`/api/reddit/pagination?userId=${this.userId}&action=all`);
      if (response.ok) {
        const data = await response.json();
        return data.states || [];
      }
    } catch (error) {
      console.error('Error in getAllPaginationStates:', error);
    }
    return [];
  }

  /**
   * Clean up old pagination states (older than 7 days)
   */
  async cleanupOldStates(): Promise<boolean> {
    try {
      const response = await fetch(`/api/reddit/pagination?userId=${this.userId}&action=cleanup`, {
        method: 'DELETE'
      });
      return response.ok;
    } catch (error) {
      console.error('Error in cleanupOldStates:', error);
      return false;
    }
  }

  /**
   * Get pagination statistics for user
   */
  async getPaginationStats(): Promise<{
    totalSubreddits: number;
    totalPostsFetched: number;
    lastActivity: string | null;
  }> {
    try {
      const states = await this.getAllPaginationStates();
      
      const totalSubreddits = states.length;
      const totalPostsFetched = states.reduce((sum, state) => sum + state.total_fetched, 0);
      const lastActivity = states.length > 0 ? states[0].last_fetched : null;

      return {
        totalSubreddits,
        totalPostsFetched,
        lastActivity
      };
    } catch (error) {
      console.error('Error in getPaginationStats:', error);
      return {
        totalSubreddits: 0,
        totalPostsFetched: 0,
        lastActivity: null
      };
    }
  }
}

/**
 * Utility function to extract pagination tokens from Reddit API response
 */
export function extractPaginationTokens(redditResponse: any): {
  after: string | null;
  before: string | null;
} {
  const after = redditResponse?.data?.after || null;
  const before = redditResponse?.data?.before || null;
  
  return { after, before };
}

/**
 * Build Reddit URL with pagination parameters
 */
export function buildRedditUrlWithPagination(
  subreddit: string,
  limit: number = 10,
  after?: string | null,
  before?: string | null,
  sort: string = 'hot'
): string {
  const baseUrl = `https://old.reddit.com/r/${subreddit}/${sort}.json`;
  const params = new URLSearchParams();
  
  params.append('limit', limit.toString());
  
  if (after) {
    params.append('after', after);
  }
  
  if (before) {
    params.append('before', before);
  }
  
  return `${baseUrl}?${params.toString()}`;
}
