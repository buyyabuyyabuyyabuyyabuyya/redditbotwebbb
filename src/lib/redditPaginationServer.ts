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
  pages_processed?: number;
  last_reset_at?: string;
  should_reset?: boolean;
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
   * Check if pagination should reset to page 1
   * Resets if: no token, 5+ pages processed, >1 hour since reset, or manual flag
   */
  private shouldResetPagination(state: PaginationState | null): boolean {
    if (!state || !state.after) {
      return true; // No state or no token = first run
    }

    // Check if manual reset flag is set
    if (state.should_reset) {
      return true;
    }

    // Check if we've gone too deep (5+ pages)
    if (state.pages_processed && state.pages_processed >= 5) {
      console.log('[PAGINATION_SERVER] Reset: Reached max depth (5 pages)');
      return true;
    }

    // Check if it's been more than 1 hour since last reset
    if (state.last_reset_at) {
      const lastReset = new Date(state.last_reset_at);
      const now = new Date();
      const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceReset >= 1) {
        console.log(`[PAGINATION_SERVER] Reset: 1 hour passed since last reset (${hoursSinceReset.toFixed(2)}h)`);
        return true;
      }
    }

    return false;
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
   * Update pagination state for a subreddit with smart reset logic
   */
  async updatePaginationState(
    subreddit: string,
    after: string | null,
    before: string | null = null,
    incrementFetched: number = 0,
    isReset: boolean = false
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
        auto_poster_config_id: this.configId || null,
        pages_processed: isReset ? 1 : (existingState?.pages_processed || 0) + 1,
        last_reset_at: isReset ? new Date().toISOString() : (existingState?.last_reset_at || new Date().toISOString()),
        should_reset: false // Clear the reset flag after update
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

      const resetInfo = isReset ? ' (RESET TO PAGE 1)' : '';
      console.log(`[PAGINATION_SERVER] Updated pagination for r/${subreddit}: after=${after}, page=${updateData.pages_processed}, fetched=${incrementFetched}${resetInfo}`);
      return true;
    } catch (error) {
      console.error('[PAGINATION_SERVER] Error in updatePaginationState:', error);
      return false;
    }
  }

  /**
   * Get smart pagination URL - decides whether to reset or continue
   */
  async getSmartPaginationUrl(
    subreddit: string,
    limit: number = 10
  ): Promise<{ url: string; isReset: boolean; state: PaginationState | null }> {
    const state = await this.getPaginationState(subreddit);
    const shouldReset = this.shouldResetPagination(state);

    if (shouldReset) {
      console.log(`[PAGINATION_SERVER] Starting fresh from page 1 for r/${subreddit}`);
      return {
        url: buildRedditUrlWithPagination(subreddit, limit),
        isReset: true,
        state
      };
    }

    console.log(`[PAGINATION_SERVER] Continuing pagination for r/${subreddit} with after=${state?.after}`);
    return {
      url: buildRedditUrlWithPagination(subreddit, limit, state?.after),
      isReset: false,
      state
    };
  }

  /**
   * Check if post IDs have already been processed
   */
  async checkAlreadyPosted(postIds: string[]): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('posted_discussions')
        .select('discussion_id')
        .in('discussion_id', postIds);

      if (error) {
        console.error('[PAGINATION_SERVER] Error checking posted discussions:', error);
        return [];
      }

      const alreadyPostedIds = data?.map(d => d.discussion_id) || [];
      console.log(`[PAGINATION_SERVER] Found ${alreadyPostedIds.length}/${postIds.length} already posted`);
      return alreadyPostedIds;
    } catch (error) {
      console.error('[PAGINATION_SERVER] Error in checkAlreadyPosted:', error);
      return [];
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
