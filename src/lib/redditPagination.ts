import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
      const { data, error } = await supabase
        .from('reddit_pagination_state')
        .select('*')
        .eq('user_id', this.userId)
        .eq('subreddit', subreddit)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching pagination state:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getPaginationState:', error);
      return null;
    }
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
      const existingState = await this.getPaginationState(subreddit);
      
      const updateData = {
        user_id: this.userId,
        subreddit,
        after,
        before,
        last_fetched: new Date().toISOString(),
        total_fetched: (existingState?.total_fetched || 0) + incrementFetched
      };

      const { error } = await supabase
        .from('reddit_pagination_state')
        .upsert(updateData, {
          onConflict: 'user_id,subreddit'
        });

      if (error) {
        console.error('Error updating pagination state:', error);
        return false;
      }

      return true;
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
      const { error } = await supabase
        .from('reddit_pagination_state')
        .delete()
        .eq('user_id', this.userId)
        .eq('subreddit', subreddit);

      if (error) {
        console.error('Error resetting pagination state:', error);
        return false;
      }

      return true;
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
      const { data, error } = await supabase
        .from('reddit_pagination_state')
        .select('*')
        .eq('user_id', this.userId)
        .order('last_fetched', { ascending: false });

      if (error) {
        console.error('Error fetching all pagination states:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAllPaginationStates:', error);
      return [];
    }
  }

  /**
   * Clean up old pagination states (older than 7 days)
   */
  async cleanupOldStates(): Promise<boolean> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { error } = await supabase
        .from('reddit_pagination_state')
        .delete()
        .eq('user_id', this.userId)
        .lt('last_fetched', sevenDaysAgo.toISOString());

      if (error) {
        console.error('Error cleaning up old pagination states:', error);
        return false;
      }

      return true;
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
  limit: number = 25,
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
