import { WebsiteConfig } from './relevanceFiltering';
import { searchMultipleSubredditsWithPagination } from './redditService';
import { generateRedditSearchQueries } from './benoService';

export interface AutoPosterConfig {
  id: string;
  website_config_id: string;
  user_id: string;
  is_active: boolean;
  posting_interval_minutes: number;
  max_posts_per_session: number;
  last_post_time: string | null;
  total_posts_made: number;
  created_at: string;
  updated_at: string;
}

export interface AutoPosterStatus {
  isRunning: boolean;
  nextPostTime: Date | null;
  postsToday: number;
  lastPostResult: string | null;
  currentWebsiteConfig: WebsiteConfig | null;
}

export class AutoPoster {
  private userId: string;
  private intervalId: NodeJS.Timeout | null = null;
  private status: AutoPosterStatus = {
    isRunning: false,
    nextPostTime: null,
    postsToday: 0,
    lastPostResult: null,
    currentWebsiteConfig: null
  };
  private onStatusUpdate?: (status: AutoPosterStatus) => void;

  constructor(userId: string, onStatusUpdate?: (status: AutoPosterStatus) => void) {
    this.userId = userId;
    this.onStatusUpdate = onStatusUpdate;
  }

  /**
   * Start the auto-poster with a specific website configuration
   */
  async start(websiteConfig: WebsiteConfig, intervalMinutes: number = 30): Promise<boolean> {
    if (this.status.isRunning) {
      console.warn('Auto-poster is already running');
      return false;
    }

    try {
      this.status = {
        isRunning: true,
        nextPostTime: new Date(Date.now() + intervalMinutes * 60 * 1000),
        postsToday: 0,
        lastPostResult: null,
        currentWebsiteConfig: websiteConfig
      };

      // Start the posting interval
      this.intervalId = setInterval(async () => {
        await this.executePost();
      }, intervalMinutes * 60 * 1000);

      // Execute first post immediately
      setTimeout(async () => {
        await this.executePost();
      }, 5000); // 5 second delay to allow UI to update

      this.updateStatus();
      return true;
    } catch (error) {
      console.error('Error starting auto-poster:', error);
      return false;
    }
  }

  /**
   * Stop the auto-poster
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.status = {
      isRunning: false,
      nextPostTime: null,
      postsToday: this.status.postsToday,
      lastPostResult: this.status.lastPostResult,
      currentWebsiteConfig: null
    };

    this.updateStatus();
  }

  /**
   * Get current status
   */
  getStatus(): AutoPosterStatus {
    return { ...this.status };
  }

  /**
   * Execute a single posting cycle
   */
  private async executePost(): Promise<void> {
    if (!this.status.currentWebsiteConfig) {
      console.error('No website config available for posting');
      return;
    }

    try {
      this.status.lastPostResult = 'Searching for discussions...';
      this.updateStatus();

      // Generate search queries based on website config
      const queries = generateRedditSearchQueries(
        this.status.currentWebsiteConfig.description,
        this.status.currentWebsiteConfig.customer_segments
      );

      // Search for relevant discussions using pagination
      const discussions = await searchMultipleSubredditsWithPagination(
        queries[0], // Use the first query
        this.userId,
        undefined, // Use default subreddits
        10,
        this.status.currentWebsiteConfig,
        true // Use pagination
      );

      if (discussions.length === 0) {
        this.status.lastPostResult = 'No relevant discussions found';
        this.updateStatus();
        return;
      }

      // Get the first available discussion
      const targetDiscussion = discussions[0];
      
      this.status.lastPostResult = `Found ${discussions.length} discussions, attempting to post...`;
      this.updateStatus();

      // Get available Reddit account
      const accountResponse = await fetch('/api/reddit/accounts/available?action=next');
      if (!accountResponse.ok) {
        const errorData = await accountResponse.json();
        this.status.lastPostResult = `No accounts available: ${errorData.error}`;
        this.updateStatus();
        return;
      }

      const { account } = await accountResponse.json();

      // Generate comment using website config
      const comment = this.generateComment(targetDiscussion, this.status.currentWebsiteConfig);

      // Post comment
      const postResponse = await fetch('/api/reddit/post-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postId: targetDiscussion.id,
          subreddit: targetDiscussion.subreddit,
          comment: comment,
          accountId: account.id,
          userId: this.userId
        })
      });

      const postResult = await postResponse.json();

      if (postResponse.ok && postResult.success) {
        this.status.postsToday += 1;
        this.status.lastPostResult = `✅ Posted to r/${targetDiscussion.subreddit}: ${targetDiscussion.title.substring(0, 50)}...`;
        
        // Record the posted discussion to prevent duplicates
        await fetch('/api/posted-discussions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            website_config_id: this.status.currentWebsiteConfig.id,
            reddit_post_id: targetDiscussion.id,
            subreddit: targetDiscussion.subreddit,
            post_title: targetDiscussion.title,
            comment_posted: comment
          })
        });
      } else {
        this.status.lastPostResult = `❌ Failed to post: ${postResult.error || 'Unknown error'}`;
      }

      // Update next post time
      const intervalMinutes = 30; // Hardcoded to 30 minutes
      this.status.nextPostTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
      
      this.updateStatus();

    } catch (error) {
      console.error('Error in executePost:', error);
      this.status.lastPostResult = `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.updateStatus();
    }
  }

  /**
   * Generate a relevant comment for a discussion
   */
  private generateComment(discussion: any, websiteConfig: WebsiteConfig): string {
    const templates = [
      `I've been working on something that might help with this. ${websiteConfig.description} - you can check it out at ${websiteConfig.url}. Would love to get your thoughts!`,
      
      `This is exactly the kind of problem we're trying to solve. We built ${websiteConfig.url} to help with ${websiteConfig.description.toLowerCase()}. Happy to share more details if you're interested!`,
      
      `Great discussion! We actually created a solution for this at ${websiteConfig.url}. ${websiteConfig.description} Feel free to check it out and let me know what you think.`,
      
      `I can relate to this challenge. That's why we developed ${websiteConfig.url} - ${websiteConfig.description.toLowerCase()}. Would be happy to help if you want to give it a try!`,
      
      `This resonates with me. We've been building ${websiteConfig.url} to address exactly this type of issue. ${websiteConfig.description} Open to feedback if you want to take a look!`
    ];

    // Select a random template
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    return template;
  }

  /**
   * Update status and notify listeners
   */
  private updateStatus(): void {
    if (this.onStatusUpdate) {
      this.onStatusUpdate({ ...this.status });
    }
  }

  /**
   * Check if browser tab should stay open
   */
  static shouldWarnAboutClosingTab(): boolean {
    return true; // Always warn when auto-poster might be running
  }

  /**
   * Get posting statistics for today
   */
  async getPostingStats(): Promise<{
    postsToday: number;
    totalPosts: number;
    lastPostTime: string | null;
  }> {
    try {
      const response = await fetch('/api/posted-discussions?action=stats');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching posting stats:', error);
    }

    return {
      postsToday: this.status.postsToday,
      totalPosts: 0,
      lastPostTime: null
    };
  }
}
