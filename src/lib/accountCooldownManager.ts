// Client-side version - use API endpoints instead of direct Supabase

export interface RedditAccountCooldown {
  id: string;
  reddit_account_id: string;
  user_id: string;
  last_action_time: string;
  action_type: 'comment' | 'message' | 'post';
  cooldown_until: string;
  created_at: string;
}

export interface RedditAccount {
  id: string;
  username: string;
  user_id: string;
  is_active: boolean;
  last_used: string | null;
  created_at: string;
}

export interface AvailableAccount {
  id: string;
  username: string;
  is_validated: boolean;
  is_discussion_poster: boolean;
  cooldown_until?: string;
  is_available: boolean;
  last_used_at?: string;
  cooldown_minutes?: number;
  proxy_enabled?: boolean;
  proxy_host?: string;
  proxy_port?: number;
  proxy_type?: string;
  proxy_username?: string;
  proxy_password?: string;
  user_agent_enabled?: boolean;
  user_agent_type?: string;
  user_agent_custom?: string;
  client_id?: string;
  client_secret?: string;
  password?: string;
}

export class AccountCooldownManager {
  private readonly COOLDOWN_MINUTES = 30;

  constructor() {
    // Client-side version - use API endpoints instead of direct Supabase
  }

  /**
   * Get all available Reddit accounts for discussion posting
   */
  async getAvailableAccounts(): Promise<AvailableAccount[]> {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || 'https://redditoutreach.com';
      const isServer = typeof window === 'undefined';
      const response = await fetch(`${baseUrl}/api/reddit/accounts/available?action=list`, {
        headers: isServer ? { 'X-Internal-API': 'true' } : {}
      });
      if (response.ok) {
        const data = await response.json();
        return data.accounts || [];
      }
    } catch (error) {
      console.error('Error fetching available accounts:', error);
    }
    return [];
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
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || 'https://redditoutreach.com';
      const isServer = typeof window === 'undefined';
      const response = await fetch(`${baseUrl}/api/reddit/accounts/cooldown`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isServer ? { 'X-Internal-API': 'true' } : {})
        },
        body: JSON.stringify({ accountId, cooldownMinutes: this.COOLDOWN_MINUTES })
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark account as used');
      }
    } catch (error) {
      console.error('Error marking account as used:', error);
      throw error;
    }
  }

  /**
   * Check if a specific account is available
   */
  async isAccountAvailable(accountId: string): Promise<boolean> {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || 'https://redditoutreach.com';
      const isServer = typeof window === 'undefined';
      const response = await fetch(`${baseUrl}/api/reddit/accounts/available?action=check&accountId=${accountId}`, {
        headers: isServer ? { 'X-Internal-API': 'true' } : {}
      });
      if (response.ok) {
        const data = await response.json();
        return data.available || false;
      }
    } catch (error) {
      console.error('Error checking account availability:', error);
    }
    return false;
  }

  /**
   * Get cooldown status for all accounts
   */
  async getAllAccountsStatus(): Promise<{
    available: AvailableAccount[];
    onCooldown: Array<AvailableAccount & { cooldownEndsAt: string; minutesRemaining: number }>;
  }> {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || 'https://redditoutreach.com';
      const isServer = typeof window === 'undefined';
      const response = await fetch(`${baseUrl}/api/reddit/accounts/available?action=status`, {
        headers: isServer ? { 'X-Internal-API': 'true' } : {}
      });
      if (response.ok) {
        const data = await response.json();
        return {
          available: data.available || [],
          onCooldown: data.onCooldown || []
        };
      }
    } catch (error) {
      console.error('Error fetching account status:', error);
    }
    return { available: [], onCooldown: [] };
  }

  /**
   * Reset cooldown for an account (admin function)
   */
  async resetAccountCooldown(accountId: string): Promise<void> {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || 'https://redditoutreach.com';
      const isServer = typeof window === 'undefined';
      const response = await fetch(`${baseUrl}/api/reddit/accounts/cooldown`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(isServer ? { 'X-Internal-API': 'true' } : {})
        },
        body: JSON.stringify({ accountId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to reset account cooldown');
      }
    } catch (error) {
      console.error('Error resetting account cooldown:', error);
      throw error;
    }
  }

  /**
   * Get cooldown info for a specific account
   */
  async getAccountCooldownInfo(accountId: string): Promise<{
    accountId: string;
    isOnCooldown: boolean;
    cooldownEndsAt?: string;
    minutesRemaining?: number;
    lastUsedAt?: string;
  }> {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || 'https://redditoutreach.com';
      const isServer = typeof window === 'undefined';
      const response = await fetch(`${baseUrl}/api/reddit/accounts/available?action=cooldown-info&accountId=${accountId}`, {
        headers: isServer ? { 'X-Internal-API': 'true' } : {}
      });
      if (response.ok) {
        const data = await response.json();
        return data.cooldownInfo || {
          accountId,
          isOnCooldown: false
        };
      }
    } catch (error) {
      console.error('Error fetching account cooldown info:', error);
    }
    return {
      accountId,
      isOnCooldown: false
    };
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
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || 'https://redditoutreach.com';
      const isServer = typeof window === 'undefined';
      const response = await fetch(`${baseUrl}/api/reddit/accounts/cooldown?action=cleanup`, {
        method: 'POST',
        headers: isServer ? { 'X-Internal-API': 'true' } : {}
      });
      
      if (!response.ok) {
        console.error('Failed to cleanup expired cooldowns');
      }
    } catch (error) {
      console.error('Error cleaning up expired cooldowns:', error);
    }
  }
}
