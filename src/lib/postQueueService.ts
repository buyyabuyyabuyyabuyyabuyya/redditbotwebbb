import { createClient } from '@supabase/supabase-js';

export interface QueuedPost {
  id: string;
  config_id: string;
  reddit_post_id: string;
  reddit_post_title: string;
  reddit_post_url: string;
  reddit_post_content?: string;
  subreddit: string;
  relevance_score: number;
  intent_score?: number;
  context_match_score?: number;
  quality_score?: number;
  engagement_score?: number;
  priority: number;
  queued_at: string;
  attempts: number;
  last_attempt_at?: string;
  post_status: 'queued' | 'posted' | 'failed' | 'skipped';
  failure_reason?: string;
}

export class PostQueueService {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
  }

  /**
   * Add multiple posts to the queue
   */
  async queuePosts(
    configId: string,
    relevantDiscussions: Array<{
      discussion: any;
      scores: {
        finalScore: number;
        intentScore: number;
        contextMatchScore: number;
        qualityScore: number;
        engagementScore: number;
      };
    }>
  ): Promise<{ success: boolean; queued: number; duplicates: number; errors: number }> {
    let queued = 0;
    let duplicates = 0;
    let errors = 0;

    console.log(`[QUEUE] Attempting to queue ${relevantDiscussions.length} posts for config ${configId}`);

    for (const { discussion, scores } of relevantDiscussions) {
      try {
        // Calculate priority based on relevance score
        const priority = scores.finalScore >= 8 ? 1 : scores.finalScore >= 6 ? 2 : 3;

        const { error } = await this.supabase
          .from('queued_reddit_posts')
          .insert({
            config_id: configId,
            reddit_post_id: discussion.id,
            reddit_post_title: discussion.title,
            reddit_post_url: discussion.url,
            reddit_post_content: discussion.content || discussion.description,
            subreddit: discussion.subreddit,
            relevance_score: scores.finalScore,
            intent_score: scores.intentScore,
            context_match_score: scores.contextMatchScore,
            quality_score: scores.qualityScore,
            engagement_score: scores.engagementScore,
            priority: priority,
            post_status: 'queued'
          });

        if (error) {
          if (error.code === '23505') { // Unique constraint violation
            duplicates++;
            console.log(`[QUEUE] Duplicate post skipped: ${discussion.id}`);
          } else {
            errors++;
            console.error(`[QUEUE] Error queuing post ${discussion.id}:`, error);
          }
        } else {
          queued++;
          console.log(`[QUEUE] Queued post ${discussion.id} with priority ${priority} (score: ${scores.finalScore})`);
        }
      } catch (error) {
        errors++;
        console.error(`[QUEUE] Exception queuing post ${discussion.id}:`, error);
      }
    }

    console.log(`[QUEUE] Queue results - Queued: ${queued}, Duplicates: ${duplicates}, Errors: ${errors}`);
    return { success: true, queued, duplicates, errors };
  }

  /**
   * Get next post to process from queue
   */
  async getNextPost(configId: string): Promise<QueuedPost | null> {
    const { data, error } = await this.supabase
      .from('queued_reddit_posts')
      .select('*')
      .eq('config_id', configId)
      .eq('post_status', 'queued')
      .lt('attempts', 3) // Don't retry failed posts more than 3 times
      .order('priority', { ascending: true })
      .order('relevance_score', { ascending: false })
      .order('queued_at', { ascending: true })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        return null;
      }
      console.error('[QUEUE] Error getting next post:', error);
      return null;
    }

    return data;
  }

  /**
   * Mark post as posted successfully
   */
  async markAsPosted(postId: string): Promise<void> {
    const { error } = await this.supabase
      .from('queued_reddit_posts')
      .update({
        post_status: 'posted',
        last_attempt_at: new Date().toISOString()
      })
      .eq('id', postId);

    if (error) {
      console.error('[QUEUE] Error marking post as posted:', error);
    }
  }

  /**
   * Mark post as failed with reason
   */
  async markAsFailed(postId: string, reason: string): Promise<void> {
    const { error } = await this.supabase
      .from('queued_reddit_posts')
      .update({
        post_status: 'failed',
        failure_reason: reason,
        attempts: (await this.supabase.from('queued_reddit_posts').select('attempts').eq('id', postId).single()).data?.attempts + 1 || 1,
        last_attempt_at: new Date().toISOString()
      })
      .eq('id', postId);

    if (error) {
      console.error('[QUEUE] Error marking post as failed:', error);
    }
  }

  /**
   * Mark post as skipped with reason
   */
  async markAsSkipped(postId: string, reason: string): Promise<void> {
    const { error } = await this.supabase
      .from('queued_reddit_posts')
      .update({
        post_status: 'skipped',
        failure_reason: reason,
        last_attempt_at: new Date().toISOString()
      })
      .eq('id', postId);

    if (error) {
      console.error('[QUEUE] Error marking post as skipped:', error);
    }
  }

  /**
   * Get queue statistics for a config
   */
  async getQueueStats(configId: string): Promise<{
    queued: number;
    posted: number;
    failed: number;
    skipped: number;
    total: number;
  }> {
    const { data, error } = await this.supabase
      .from('queued_reddit_posts')
      .select('post_status')
      .eq('config_id', configId);

    if (error) {
      console.error('[QUEUE] Error getting queue stats:', error);
      return { queued: 0, posted: 0, failed: 0, skipped: 0, total: 0 };
    }

    const stats = data.reduce((acc, post) => {
      const status = post.post_status as 'queued' | 'posted' | 'failed' | 'skipped';
      if (status === 'queued' || status === 'posted' || status === 'failed' || status === 'skipped') {
        acc[status]++;
      }
      acc.total++;
      return acc;
    }, { queued: 0, posted: 0, failed: 0, skipped: 0, total: 0 });

    return stats;
  }

  /**
   * Clean up old posts (older than 7 days)
   */
  async cleanupOldPosts(): Promise<{ deleted: number }> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase
      .from('queued_reddit_posts')
      .delete()
      .lt('queued_at', sevenDaysAgo)
      .select('id');

    if (error) {
      console.error('[QUEUE] Error cleaning up old posts:', error);
      return { deleted: 0 };
    }

    const deleted = data?.length || 0;
    console.log(`[QUEUE] Cleaned up ${deleted} old posts`);
    return { deleted };
  }
}
