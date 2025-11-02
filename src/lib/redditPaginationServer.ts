// Server-side pagination manager for use in serverless/cron environments
// Uses direct Supabase access instead of HTTP API calls

import { createClient } from '@supabase/supabase-js';

export interface PaginationState {
  subreddit: string;
  after: string | null;
  before: string | null;
  last_fetched: string;
  total_fetched: number;
  auto_poster_config_id?: string;
}

export class RedditPaginationManagerServer {
  private userId: string;
  private configId?: string;
  private supabase;

  constructor(userId: string, configId?: string) {
    this.userId = userId;
    this.configId = configId;
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
  }

  /**
   * Get pagination state for a subreddit
   */
  async getPaginationState(subreddit: string): Promise<PaginationState | null> {
    try {
      let query = this.supabase
        .from('reddit_pagination_state')
        .select('*')
        .eq('user_id', this.userId)
        .eq('subreddit', subreddit);

      // If configId is provided, filter by it for per-config pagination
      if (this.configId) {
        query = query.eq('auto_poster_config_id', this.configId);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found - this is normal for first fetch
          return null;
        }
        console.error('[PAGINATION_SERVER] Error getting state:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[PAGINATION_SERVER] Error in getPaginationState:', error);
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
      // First, try to get existing state
      const existingState = await this.getPaginationState(subreddit);

      const updateData = {
        user_id: this.userId,
        subreddit,
        after,
        before,
        last_fetched: new Date().toISOString(),
        total_fetched: (existingState?.total_fetched || 0) + incrementFetched,
        auto_poster_config_id: this.configId || null
      };

      const { error } = await this.supabase
        .from('reddit_pagination_state')
        .upsert(updateData, {
          onConflict: this.configId 
            ? 'user_id,subreddit,auto_poster_config_id'
            : 'user_id,subreddit'
        });

      if (error) {
        console.error('[PAGINATION_SERVER] Error updating state:', error);
        return false;
      }

      console.log(`[PAGINATION_SERVER] Updated pagination for r/${subreddit}: after=${after}, fetched=${incrementFetched}`);
      return true;
    } catch (error) {
      console.error('[PAGINATION_SERVER] Error in updatePaginationState:', error);
      return false;
    }
  }

  /**
   * Reset pagination state for a subreddit (start from beginning)
   */
  async resetPaginationState(subreddit: string): Promise<boolean> {
    try {
      let query = this.supabase
        .from('reddit_pagination_state')
        .delete()
        .eq('user_id', this.userId)
        .eq('subreddit', subreddit);

      if (this.configId) {
        query = query.eq('auto_poster_config_id', this.configId);
      }

      const { error } = await query;

      if (error) {
        console.error('[PAGINATION_SERVER] Error resetting state:', error);
        return false;
      }

      console.log(`[PAGINATION_SERVER] Reset pagination for r/${subreddit}`);
      return true;
    } catch (error) {
      console.error('[PAGINATION_SERVER] Error in resetPaginationState:', error);
      return false;
    }
  }

  /**
   * Get all pagination states for user
   */
  async getAllPaginationStates(): Promise<PaginationState[]> {
    try {
      let query = this.supabase
        .from('reddit_pagination_state')
        .select('*')
        .eq('user_id', this.userId);

      if (this.configId) {
        query = query.eq('auto_poster_config_id', this.configId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[PAGINATION_SERVER] Error getting all states:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[PAGINATION_SERVER] Error in getAllPaginationStates:', error);
      return [];
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
