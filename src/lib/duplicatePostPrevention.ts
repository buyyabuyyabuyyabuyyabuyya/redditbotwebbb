import { createClient } from '@supabase/supabase-js';

export interface PostedDiscussion {
  id: string;
  website_config_id: string;
  reddit_post_id: string;
  subreddit: string;
  post_title: string;
  posted_at: string;
  reddit_account_id: string;
  comment_id?: string;
  comment_url?: string;
}

export class DuplicatePostPrevention {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
  }

  /**
   * Check if a Reddit post has already been messaged for a specific website config
   */
  async hasBeenPosted(websiteConfigId: string, redditPostId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('posted_reddit_discussions')
      .select('id')
      .eq('website_config_id', websiteConfigId)
      .eq('reddit_post_id', redditPostId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error checking posted discussions:', error);
      return false;
    }

    return !!data;
  }

  /**
   * Get all posted Reddit post IDs for a specific website config
   */
  async getPostedDiscussionIds(websiteConfigId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('posted_reddit_discussions')
      .select('reddit_post_id')
      .eq('website_config_id', websiteConfigId);

    if (error) {
      console.error('Error fetching posted discussions:', error);
      return [];
    }

    return data?.map(item => item.reddit_post_id) || [];
  }

  /**
   * Record a successful post to prevent future duplicates
   */
  async recordPostedDiscussion(
    websiteConfigId: string,
    redditPostId: string,
    subreddit: string,
    postTitle: string,
    redditAccountId: string,
    commentId?: string,
    commentUrl?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('posted_reddit_discussions')
      .insert({
        website_config_id: websiteConfigId,
        reddit_post_id: redditPostId,
        subreddit,
        post_title: postTitle,
        reddit_account_id: redditAccountId,
        comment_id: commentId,
        comment_url: commentUrl
      });

    if (error) {
      console.error('Error recording posted discussion:', error);
      throw error;
    }
  }

  /**
   * Filter out discussions that have already been posted for this website config
   */
  async filterUnpostedDiscussions<T extends { id: string }>(
    discussions: T[],
    websiteConfigId: string
  ): Promise<T[]> {
    if (discussions.length === 0) return discussions;

    const postedIds = await this.getPostedDiscussionIds(websiteConfigId);
    return discussions.filter(discussion => !postedIds.includes(discussion.id));
  }

  /**
   * Get posting history for a website config
   */
  async getPostingHistory(
    websiteConfigId: string,
    limit: number = 50
  ): Promise<PostedDiscussion[]> {
    const { data, error } = await this.supabase
      .from('posted_reddit_discussions')
      .select('*')
      .eq('website_config_id', websiteConfigId)
      .order('posted_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching posting history:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Check if multiple posts have been posted for a website config
   */
  async checkMultiplePosted(
    websiteConfigId: string,
    redditPostIds: string[]
  ): Promise<{ [postId: string]: boolean }> {
    if (redditPostIds.length === 0) return {};

    const { data, error } = await this.supabase
      .from('posted_reddit_discussions')
      .select('reddit_post_id')
      .eq('website_config_id', websiteConfigId)
      .in('reddit_post_id', redditPostIds);

    if (error) {
      console.error('Error checking multiple posted discussions:', error);
      return {};
    }

    const postedIds = new Set(data?.map(item => item.reddit_post_id) || []);
    const result: { [postId: string]: boolean } = {};
    
    redditPostIds.forEach(postId => {
      result[postId] = postedIds.has(postId);
    });

    return result;
  }

  /**
   * Remove a posted discussion record (for testing or corrections)
   */
  async removePostedDiscussion(websiteConfigId: string, redditPostId: string): Promise<void> {
    const { error } = await this.supabase
      .from('posted_reddit_discussions')
      .delete()
      .eq('website_config_id', websiteConfigId)
      .eq('reddit_post_id', redditPostId);

    if (error) {
      console.error('Error removing posted discussion:', error);
      throw error;
    }
  }
}
