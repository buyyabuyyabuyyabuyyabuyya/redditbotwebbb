import { createClient } from '@supabase/supabase-js';

export interface RedditAccountCooldown {
  id: string;
  reddit_account_id: string;
  last_used_at?: string;
  cooldown_until?: string;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvailableAccount {
  id: string;
  username: string;
  is_validated: boolean;
  is_discussion_poster: boolean;
  cooldown_until?: string;
  is_available: boolean;
}

export class AccountCooldownManager {
  private supabase;
  private readonly COOLDOWN_MINUTES = 30;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
  }

  /**
   * Get all available Reddit accounts for discussion posting
   */
  async getAvailableAccounts(): Promise<AvailableAccount[]> {
    const now = new Date().toISOString();

    const { data: accounts, error } = await this.supabase
      .from('reddit_accounts')
      .select(`
        id,
        username,
        is_validated,
        is_discussion_poster,
        current_cooldown_until,
        reddit_account_cooldowns (
          is_available,
          cooldown_until
        )
      `)
      .eq('is_discussion_poster', true)
      .eq('is_validated', true);

    if (error) {
      console.error('Error fetching available accounts:', error);
      return [];
    }

    return (accounts || []).map(account => ({
      id: account.id,
      username: account.username,
      is_validated: account.is_validated,
      is_discussion_poster: account.is_discussion_poster,
      cooldown_until: account.current_cooldown_until,
      is_available: !account.current_cooldown_until || new Date(account.current_cooldown_until) <= new Date(now)
    })).filter(account => account.is_available);
  }

  /**
   * Get the next available account for posting
   */
  async getNextAvailableAccount(): Promise<AvailableAccount | null> {
    const availableAccounts = await this.getAvailableAccounts();
    
    if (availableAccounts.length === 0) {
      return null;
    }

    // Return the first available account (could implement round-robin logic here)
    return availableAccounts[0];
  }

  /**
   * Mark an account as used and set cooldown
   */
  async markAccountAsUsed(accountId: string): Promise<void> {
    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + (this.COOLDOWN_MINUTES * 60 * 1000));

    try {
      // Update the reddit_accounts table
      await this.supabase
        .from('reddit_accounts')
        .update({
          current_cooldown_until: cooldownUntil.toISOString(),
          total_messages_sent: this.supabase.rpc('increment_messages_sent', { account_id: accountId }),
          last_message_sent_at: now.toISOString()
        })
        .eq('id', accountId);

      // Upsert cooldown record
      await this.supabase
        .from('reddit_account_cooldowns')
        .upsert({
          reddit_account_id: accountId,
          last_used_at: now.toISOString(),
          cooldown_until: cooldownUntil.toISOString(),
          is_available: false,
          updated_at: now.toISOString()
        }, {
          onConflict: 'reddit_account_id'
        });

    } catch (error) {
      console.error('Error marking account as used:', error);
      throw error;
    }
  }

  /**
   * Check if a specific account is available
   */
  async isAccountAvailable(accountId: string): Promise<boolean> {
    const now = new Date().toISOString();

    const { data: account, error } = await this.supabase
      .from('reddit_accounts')
      .select('current_cooldown_until')
      .eq('id', accountId)
      .eq('is_discussion_poster', true)
      .eq('is_validated', true)
      .single();

    if (error || !account) {
      return false;
    }

    return !account.current_cooldown_until || new Date(account.current_cooldown_until) <= new Date(now);
  }

  /**
   * Get cooldown status for all accounts
   */
  async getAllAccountsStatus(): Promise<{
    available: AvailableAccount[];
    onCooldown: Array<AvailableAccount & { cooldownEndsAt: string; minutesRemaining: number }>;
  }> {
    const now = new Date();

    const { data: accounts, error } = await this.supabase
      .from('reddit_accounts')
      .select(`
        id,
        username,
        is_validated,
        is_discussion_poster,
        current_cooldown_until,
        total_messages_sent,
        last_message_sent_at
      `)
      .eq('is_discussion_poster', true)
      .eq('is_validated', true);

    if (error) {
      console.error('Error fetching account status:', error);
      return { available: [], onCooldown: [] };
    }

    const available: AvailableAccount[] = [];
    const onCooldown: Array<AvailableAccount & { cooldownEndsAt: string; minutesRemaining: number }> = [];

    (accounts || []).forEach(account => {
      const baseAccount = {
        id: account.id,
        username: account.username,
        is_validated: account.is_validated,
        is_discussion_poster: account.is_discussion_poster,
        cooldown_until: account.current_cooldown_until,
        is_available: false
      };

      if (!account.current_cooldown_until || new Date(account.current_cooldown_until) <= now) {
        available.push({ ...baseAccount, is_available: true });
      } else {
        const cooldownEnd = new Date(account.current_cooldown_until);
        const minutesRemaining = Math.ceil((cooldownEnd.getTime() - now.getTime()) / (1000 * 60));
        
        onCooldown.push({
          ...baseAccount,
          cooldownEndsAt: account.current_cooldown_until,
          minutesRemaining
        });
      }
    });

    return { available, onCooldown };
  }

  /**
   * Reset cooldown for an account (admin function)
   */
  async resetAccountCooldown(accountId: string): Promise<void> {
    try {
      await this.supabase
        .from('reddit_accounts')
        .update({
          current_cooldown_until: null
        })
        .eq('id', accountId);

      await this.supabase
        .from('reddit_account_cooldowns')
        .update({
          is_available: true,
          cooldown_until: null,
          updated_at: new Date().toISOString()
        })
        .eq('reddit_account_id', accountId);

    } catch (error) {
      console.error('Error resetting account cooldown:', error);
      throw error;
    }
  }

  /**
   * Get estimated wait time until next account is available
   */
  async getEstimatedWaitTime(): Promise<number> {
    const { onCooldown } = await this.getAllAccountsStatus();
    
    if (onCooldown.length === 0) {
      return 0; // Accounts are available now
    }

    // Return the shortest wait time
    return Math.min(...onCooldown.map(account => account.minutesRemaining));
  }

  /**
   * Clean up expired cooldowns (maintenance function)
   */
  async cleanupExpiredCooldowns(): Promise<void> {
    const now = new Date().toISOString();

    try {
      // Reset expired cooldowns in reddit_accounts
      await this.supabase
        .from('reddit_accounts')
        .update({ current_cooldown_until: null })
        .lt('current_cooldown_until', now);

      // Update cooldown records
      await this.supabase
        .from('reddit_account_cooldowns')
        .update({
          is_available: true,
          updated_at: now
        })
        .lt('cooldown_until', now);

    } catch (error) {
      console.error('Error cleaning up expired cooldowns:', error);
    }
  }
}
