import { createClient } from '@supabase/supabase-js';

// Create a Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

interface ApiKey {
  id: number;
  key: string;
  provider: string;
  model: string;
  is_active: boolean;
  being_used: boolean;
  rate_limit_reset: string | null;
  usage_count: number;
  error_count: number;
  last_used: string | null;
  created_at: string;
  updated_at: string;
}

export class ApiKeyManager {
  private static instance: ApiKeyManager;
  
  static getInstance(): ApiKeyManager {
    if (!ApiKeyManager.instance) {
      ApiKeyManager.instance = new ApiKeyManager();
    }
    return ApiKeyManager.instance;
  }

  /**
   * Acquire an available API key for exclusive use
   * @param userId - User ID for tracking
   * @param provider - API provider (default: 'gemini')
   * @returns API key string or null if none available
   */
  async acquireApiKey(userId: string, provider: string = 'gemini'): Promise<string | null> {
    try {
      console.log(`[${userId}] Acquiring API key for provider: ${provider}`);

      // Retrieve a pool of available keys that are not being used or rate-limited
      const { data: availableKeys, error } = await supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('provider', provider)
        .eq('is_active', true)
        .eq('being_used', false)
        .or(`rate_limit_reset.is.null,rate_limit_reset.lt.${new Date().toISOString()}`)
        // Limit the candidate set to keep the payload small (adjust as needed)
        .limit(100);

      if (error) {
        console.error(`[${userId}] Error fetching available API keys:`, error);
        return null;
      }

      if (!availableKeys || availableKeys.length === 0) {
        console.log(`[${userId}] No available API keys found`);
        return null;
      }

      // Randomly choose one key from the available pool so that the same
      // key is not always picked first.
      const randomIndex = Math.floor(Math.random() * availableKeys.length);
      const apiKey = availableKeys[randomIndex] as ApiKey;

      // Mark the key as being used
      const { data: updateData, error: updateError } = await supabaseAdmin
        .from('api_keys')
        .update({
          being_used: true,
          last_used: new Date().toISOString(),
          usage_count: apiKey.usage_count + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', apiKey.id)
        .eq('being_used', false) // Ensure it's still not being used (atomic check)
        .select();

      if (updateError) {
        console.error(`[${userId}] Error marking API key as being used:`, updateError);
        return null;
      }

      // Check if the update actually affected any rows
      if (!updateData || updateData.length === 0) {
        console.log(`[${userId}] API key was already taken by another request, trying again...`);
        // Recursively try to get another key
        return this.acquireApiKey(userId, provider);
      }

      console.log(`[${userId}] Successfully marked API key as being_used = true`);

      const keyPrefix = apiKey.key.substring(0, 6);
      const keySuffix = apiKey.key.substring(apiKey.key.length - 4);
      console.log(`[${userId}] Acquired API key: ${keyPrefix}...${keySuffix} (ID: ${apiKey.id})`);

      return apiKey.key;
    } catch (error) {
      console.error(`[${userId}] Error in acquireApiKey:`, error);
      return null;
    }
  }

  /**
   * Release an API key back to the pool
   * @param apiKey - The API key to release
   * @param userId - User ID for tracking
   */
  async releaseApiKey(apiKey: string, userId: string): Promise<void> {
    try {
      // Hold the key for a short grace period (5 s) *synchronously* so that rapid
      // successive requests do not grab the exact same key immediately. This is
      // preferred over setTimeout in a serverless context where the execution
      // environment may be frozen as soon as the handler returns.
      console.log(`[${userId}] Waiting 5 seconds before releasing API key`);
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const { error } = await supabaseAdmin
        .from('api_keys')
        .update({
          being_used: false,
          updated_at: new Date().toISOString(),
        })
        .eq('key', apiKey);

      if (error) {
        console.error(`[${userId}] Error releasing API key:`, error);
      } else {
        console.log(`[${userId}] API key released successfully`);
      }
    } catch (error) {
      console.error(`[${userId}] Error scheduling releaseApiKey:`, error);
    }
  }

  /**
   * Handle API key error and set rate limit if needed
   * @param apiKey - The API key that errored
   * @param error - The error object
   * @param userId - User ID for tracking
   */
  async handleApiKeyError(apiKey: string, error: any, userId: string): Promise<void> {
    try {
      console.log(`[${userId}] Handling API key error:`, error.message);

      // Get current key data
      const { data: keyData, error: fetchError } = await supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('key', apiKey)
        .single();

      if (fetchError || !keyData) {
        console.error(`[${userId}] Error fetching key data:`, fetchError);
        return;
      }

      const updates: any = {
        error_count: keyData.error_count + 1,
        updated_at: new Date().toISOString()
      };

      // Check if it's a rate limit error
      if (this.isRateLimitError(error)) {
        // Set rate limit reset time (e.g., 1 hour from now)
        const resetTime = new Date();
        resetTime.setHours(resetTime.getHours() + 1);
        updates.rate_limit_reset = resetTime.toISOString();
        
        console.log(`[${userId}] API key rate limited until: ${resetTime.toISOString()}`);
        
        // Keep being_used as true during rate limit period
        // It will be released when rate limit expires
      } else {
        // For other errors, release the key immediately
        updates.being_used = false;
        console.log(`[${userId}] API key released due to non-rate-limit error`);
      }

      const { error: updateError } = await supabaseAdmin
        .from('api_keys')
        .update(updates)
        .eq('key', apiKey);

      if (updateError) {
        console.error(`[${userId}] Error updating API key after error:`, updateError);
      }
    } catch (error) {
      console.error(`[${userId}] Error in handleApiKeyError:`, error);
    }
  }

  /**
   * Release all rate-limited keys that have passed their reset time
   */
  async releaseExpiredRateLimitedKeys(): Promise<void> {
    try {
      console.log('Releasing expired rate-limited keys...');

      const { error } = await supabaseAdmin
        .from('api_keys')
        .update({
          being_used: false,
          rate_limit_reset: null,
          updated_at: new Date().toISOString()
        })
        .eq('being_used', true)
        .not('rate_limit_reset', 'is', null)
        .lt('rate_limit_reset', new Date().toISOString());

      if (error) {
        console.error('Error releasing expired rate-limited keys:', error);
      } else {
        console.log('Expired rate-limited keys released successfully');
      }
    } catch (error) {
      console.error('Error in releaseExpiredRateLimitedKeys:', error);
    }
  }

  /**
   * Get statistics about API key usage
   */
  async getKeyStats(provider: string = 'gemini'): Promise<any> {
    try {
      const { data, error } = await supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('provider', provider);

      if (error) {
        console.error('Error fetching key stats:', error);
        return null;
      }

      const stats = {
        total: data.length,
        active: data.filter(k => k.is_active).length,
        being_used: data.filter(k => k.being_used).length,
        rate_limited: data.filter(k => k.rate_limit_reset && new Date(k.rate_limit_reset) > new Date()).length,
        available: data.filter(k => k.is_active && !k.being_used && (!k.rate_limit_reset || new Date(k.rate_limit_reset) <= new Date())).length
      };

      return stats;
    } catch (error) {
      console.error('Error in getKeyStats:', error);
      return null;
    }
  }

  /**
   * Check if an error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorStatus = error.status || 0;
    
    return (
      errorStatus === 429 ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('too many requests')
    );
  }
}

// Export singleton instance
export const apiKeyManager = ApiKeyManager.getInstance();
