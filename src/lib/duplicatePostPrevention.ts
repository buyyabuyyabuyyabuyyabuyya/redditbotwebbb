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
  constructor() {
    // Client-side version - use API endpoints instead of direct Supabase
  }

  /**
   * Check if a Reddit post has already been messaged for a specific website config
   */
  async hasBeenPosted(websiteConfigId: string, redditPostId: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/posted-discussions?action=check&websiteConfigId=${websiteConfigId}&redditPostId=${redditPostId}`);
      if (response.ok) {
        const data = await response.json();
        return data.exists || false;
      }
    } catch (error) {
      console.error('Error checking if post has been posted:', error);
    }
    return false; // Assume not posted if there's an error
  }

  /**
   * Record that a Reddit post has been messaged for a specific website config
   */
  async recordPostedDiscussion(
    websiteConfigId: string,
    redditPostId: string,
    subreddit: string,
    postTitle: string,
    redditAccountId: string,
    commentId?: string,
    commentUrl?: string
  ): Promise<boolean> {
    try {
      const response = await fetch('/api/posted-discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website_config_id: websiteConfigId,
          reddit_post_id: redditPostId,
          subreddit: subreddit,
          post_title: postTitle,
          reddit_account_id: redditAccountId,
          comment_id: commentId,
          comment_url: commentUrl
        })
      });
      return response.ok;
    } catch (error) {
      console.error('Error recording posted discussion:', error);
      return false;
    }
  }

  /**
   * Get all posted discussions for a specific website config
   */
  async getPostedDiscussions(websiteConfigId: string, limit: number = 50): Promise<PostedDiscussion[]> {
    try {
      const response = await fetch(`/api/posted-discussions?action=list&websiteConfigId=${websiteConfigId}&limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        return data.posts || [];
      }
    } catch (error) {
      console.error('Error fetching posted discussions:', error);
    }
    return [];
  }

  /**
   * Get posted discussion IDs for filtering
   */
  async getPostedDiscussionIds(websiteConfigId: string): Promise<string[]> {
    try {
      const response = await fetch(`/api/posted-discussions?action=ids&websiteConfigId=${websiteConfigId}`);
      if (response.ok) {
        const data = await response.json();
        return data.ids || [];
      }
    } catch (error) {
      console.error('Error fetching posted discussion IDs:', error);
    }
    return [];
  }

  /**
   * Clean up old posted discussions (older than 30 days)
   */
  async cleanupOldDiscussions(): Promise<void> {
    try {
      await fetch('/api/posted-discussions?action=cleanup', { method: 'DELETE' });
    } catch (error) {
      console.error('Error cleaning up old discussions:', error);
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
   * Check if multiple posts have been posted for a website config
   */
  async checkMultiplePosted(
    websiteConfigId: string,
    redditPostIds: string[]
  ): Promise<{ [postId: string]: boolean }> {
    if (redditPostIds.length === 0) return {};

    try {
      const response = await fetch('/api/posted-discussions?action=check-multiple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteConfigId, redditPostIds })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.results || {};
      }
    } catch (error) {
      console.error('Error checking multiple posted discussions:', error);
    }
    
    return {};
  }

  /**
   * Remove a posted discussion record (for testing or corrections)
   */
  async removePostedDiscussion(websiteConfigId: string, redditPostId: string): Promise<void> {
    try {
      const response = await fetch('/api/posted-discussions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteConfigId, redditPostId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to remove posted discussion');
      }
    } catch (error) {
      console.error('Error removing posted discussion:', error);
      throw error;
    }
  }
}
