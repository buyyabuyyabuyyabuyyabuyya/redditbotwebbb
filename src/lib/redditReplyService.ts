interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  subreddit: string;
  score: number;
  url: string;
  permalink: string;
}

interface GeminiReplyResponse {
  reply: string;
  confidence: number;
  tone_used: string;
  character_count: number;
  keywords_used: string[];
}

interface RedditReplyOptions {
  tone?: 'helpful' | 'casual' | 'professional' | 'enthusiastic' | 'informative';
  maxLength?: number;
  keywords?: string[];
  accountId: string;
  userId?: string;
}

interface RedditReplyResult {
  success: boolean;
  commentId?: string;
  commentUrl?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
  generatedReply?: string;
  confidence?: number;
}

export class RedditReplyService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  }

  /**
   * Generate a Reddit reply using Gemini AI
   */
  async generateReply(
    post: RedditPost,
    options: Omit<RedditReplyOptions, 'accountId' | 'userId'> = {}
  ): Promise<{ success: boolean; reply?: GeminiReplyResponse; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/gemini/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API': 'true',
        },
        body: JSON.stringify({
          postTitle: post.title,
          postContent: post.selftext || 'No content provided',
          subreddit: post.subreddit,
          tone: options.tone || 'helpful',
          maxLength: options.maxLength || 500,
          keywords: options.keywords || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      
      if (!data.success || !data.reply) {
        return {
          success: false,
          error: 'Invalid response from Gemini API',
        };
      }

      return {
        success: true,
        reply: data.reply,
      };
    } catch (error) {
      console.error('Error generating reply:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Post a comment to Reddit
   */
  async postComment(
    post: RedditPost,
    comment: string,
    accountId: string,
    userId?: string
  ): Promise<{ success: boolean; commentId?: string; commentUrl?: string; error?: string; skipped?: boolean; reason?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/reddit/post-comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API': 'true',
        },
        body: JSON.stringify({
          userId,
          accountId,
          postId: post.id,
          comment,
          subreddit: post.subreddit,
        }),
      });

      const data = await response.json();

      if (response.status === 429) {
        return {
          success: false,
          error: 'rate_limited',
        };
      }

      if (response.status === 402) {
        return {
          success: false,
          error: 'quota_reached',
        };
      }

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}`,
        };
      }

      if (data.skipped) {
        return {
          success: false,
          skipped: true,
          reason: data.reason,
        };
      }

      return {
        success: true,
        commentId: data.commentId,
        commentUrl: data.commentUrl,
      };
    } catch (error) {
      console.error('Error posting comment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate and post a Reddit reply in one operation
   */
  async generateAndPostReply(
    post: RedditPost,
    options: RedditReplyOptions
  ): Promise<RedditReplyResult> {
    try {
      // Step 1: Generate the reply using Gemini
      const replyResult = await this.generateReply(post, options);
      
      if (!replyResult.success || !replyResult.reply) {
        return {
          success: false,
          error: `Failed to generate reply: ${replyResult.error}`,
        };
      }

      const generatedReply = replyResult.reply.reply;
      const confidence = replyResult.reply.confidence;

      // Step 2: Post the comment to Reddit
      const postResult = await this.postComment(
        post,
        generatedReply,
        options.accountId,
        options.userId
      );

      if (!postResult.success) {
        return {
          success: false,
          error: postResult.error,
          skipped: postResult.skipped,
          reason: postResult.reason,
          generatedReply, // Include the generated reply even if posting failed
          confidence,
        };
      }

      return {
        success: true,
        commentId: postResult.commentId,
        commentUrl: postResult.commentUrl,
        generatedReply,
        confidence,
      };
    } catch (error) {
      console.error('Error in generateAndPostReply:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Batch process multiple posts for reply generation and posting
   */
  async batchProcessPosts(
    posts: RedditPost[],
    options: RedditReplyOptions,
    onProgress?: (processed: number, total: number, result: RedditReplyResult) => void
  ): Promise<RedditReplyResult[]> {
    const results: RedditReplyResult[] = [];
    
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      
      try {
        const result = await this.generateAndPostReply(post, options);
        results.push(result);
        
        if (onProgress) {
          onProgress(i + 1, posts.length, result);
        }

        // Add a small delay between requests to avoid rate limiting
        if (i < posts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
      } catch (error) {
        const errorResult: RedditReplyResult = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        results.push(errorResult);
        
        if (onProgress) {
          onProgress(i + 1, posts.length, errorResult);
        }
      }
    }
    
    return results;
  }

  /**
   * Validate if a post is suitable for replying
   */
  validatePost(post: RedditPost): { valid: boolean; reason?: string } {
    if (!post.id || !post.title) {
      return { valid: false, reason: 'Missing post ID or title' };
    }

    if (!post.subreddit) {
      return { valid: false, reason: 'Missing subreddit information' };
    }

    // Check if post is too old (Reddit locks posts after 6 months)
    // This would require post creation date, which isn't in our current interface
    // but could be added later

    return { valid: true };
  }
}

// Export a singleton instance
export const redditReplyService = new RedditReplyService();
