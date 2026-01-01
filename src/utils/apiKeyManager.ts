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
//push test
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
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 5000; // 5 seconds between requests

  static getInstance(): ApiKeyManager {
    if (!ApiKeyManager.instance) {
      ApiKeyManager.instance = new ApiKeyManager();
    }
    return ApiKeyManager.instance;
  }

  /**
   * Throttle requests to prevent IP-based rate limiting
   */
  private async throttleRequest(userId: string): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      console.log(`[${userId}] Throttling request, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Acquire an available API key for exclusive use
   * @param userId - User ID for tracking
   * @param provider - API provider (default: 'gemini')
   * @returns API key string or null if none available
   */
  async acquireApiKey(userId: string, provider: string = 'gemini'): Promise<string | null> {
    // Throttle requests to prevent IP-based rate limiting
    await this.throttleRequest(userId);
    try {
      console.log(`[${userId}] Acquiring API key for provider: ${provider}`);

      // Retrieve a pool of available keys that are not rate-limited
      // NOTE: being_used check commented out - using single API key for all requests
      const { data: availableKeys, error } = await supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('provider', provider)
        .eq('is_active', true)
        // .eq('being_used', false)  // COMMENTED OUT: Single key usage
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

      // COMMENTED OUT: Mark the key as being used (single key usage)
      // NOTE: This entire block is commented out since we're using one API key for all requests
      /*
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
      */

      // Update usage stats without locking the key
      await supabaseAdmin
        .from('api_keys')
        .update({
          last_used: new Date().toISOString(),
          usage_count: apiKey.usage_count + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', apiKey.id);

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
    // COMMENTED OUT: Release API key logic (single key usage)
    // NOTE: This entire function is essentially a no-op now since we're using one key
    /*
    try {
      // Hold the key for a grace period (15 s) *synchronously* so that rapid
      // successive requests do not grab the exact same key immediately. This is
      // preferred over setTimeout in a serverless context where the execution
      // environment may be frozen as soon as the handler returns.
      // Increased to 15 seconds to avoid Gemini API 429 rate limit errors
      console.log(`[${userId}] Waiting 15 seconds before releasing API key`);
      await new Promise((resolve) => setTimeout(resolve, 15000));

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
    */
    // No-op: Single key usage means no need to release
    console.log(`[${userId}] releaseApiKey called (no-op for single key usage)`);
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
      // Use limit(1) instead of single() to handle potential duplicate keys
      const { data: keyDataArray, error: fetchError } = await supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('key', apiKey)
        .limit(1);

      if (fetchError || !keyDataArray || keyDataArray.length === 0) {
        console.error(`[${userId}] Error fetching key data:`, fetchError);
        return;
      }

      const keyData = keyDataArray[0];

      const updates: any = {
        error_count: keyData.error_count + 1,
        updated_at: new Date().toISOString()
      };

      // Check if it's a rate limit error
      if (this.isRateLimitError(error)) {
        // Distinguish between TPM (tokens per minute) and daily quota errors
        const isTpmError = this.isTPMRateLimitError(error);

        if (isTpmError) {
          // TPM errors are temporary - DO NOT lock the key
          // The calling code should truncate content and retry immediately
          console.log(`[${userId}] TPM rate limit hit - no lockout, caller should truncate and retry`);
          // Do NOT set rate_limit_reset for TPM errors
        } else {
          // Daily quota exhaustion - lock for 1 hour
          const resetTime = new Date();
          resetTime.setHours(resetTime.getHours() + 1);
          updates.rate_limit_reset = resetTime.toISOString();
          console.log(`[${userId}] Daily quota exhausted - API key locked until: ${resetTime.toISOString()}`);
        }
      } else if (this.isInvalidKeyError(error)) {
        // Deactivate invalid keys permanently
        updates.is_active = false;
        // updates.being_used = false;  // COMMENTED OUT: Single key usage
        console.log(`[${userId}] API key marked as inactive due to invalid/unauthorized error`);
      } else {
        // COMMENTED OUT: For other errors, release the key immediately
        // updates.being_used = false;  // COMMENTED OUT: Single key usage
        console.log(`[${userId}] Non-rate-limit error occurred`);
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
    // COMMENTED OUT: Release expired rate-limited keys (single key usage)
    // NOTE: This function is mostly a no-op now, but we still clear rate_limit_reset
    try {
      console.log('Clearing expired rate limits...');

      const { error } = await supabaseAdmin
        .from('api_keys')
        .update({
          // being_used: false,  // COMMENTED OUT: Single key usage
          rate_limit_reset: null,
          updated_at: new Date().toISOString()
        })
        // .eq('being_used', true)  // COMMENTED OUT: Single key usage
        .not('rate_limit_reset', 'is', null)
        .lt('rate_limit_reset', new Date().toISOString());

      if (error) {
        console.error('Error clearing expired rate limits:', error);
      } else {
        console.log('Expired rate limits cleared successfully');
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
        // being_used: data.filter(k => k.being_used).length,  // COMMENTED OUT: Single key usage
        rate_limited: data.filter(k => k.rate_limit_reset && new Date(k.rate_limit_reset) > new Date()).length,
        available: data.filter(k => k.is_active && /* !k.being_used && */ (!k.rate_limit_reset || new Date(k.rate_limit_reset) <= new Date())).length
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
      errorMessage.includes('too many requests') ||
      errorMessage.includes('api key expired') ||
      errorMessage.includes('expired')
    );
  }

  /**
   * Check if an error is specifically a TPM (Tokens Per Minute) rate limit
   * TPM errors should NOT lock the key - just truncate and retry
   */
  private isTPMRateLimitError(error: any): boolean {
    const errorMessage = error.message || '';
    // Groq TPM errors have this format: "...on tokens per minute (TPM): Limit 6000, Used 5835, Requested 998..."
    return errorMessage.includes('tokens per minute (TPM)');
  }

  /**
   * Parse token information from Groq TPM error message
   * Returns: { limit, used, requested } or null if not a TPM error
   */
  parseTPMError(error: any): { limit: number; used: number; requested: number } | null {
    const errorMessage = error.message || '';

    // Example: "...Limit 6000, Used 5835, Requested 998..."
    const limitMatch = errorMessage.match(/Limit\s+(\d+)/);
    const usedMatch = errorMessage.match(/Used\s+(\d+)/);
    const requestedMatch = errorMessage.match(/Requested\s+(\d+)/);

    if (limitMatch && usedMatch && requestedMatch) {
      return {
        limit: parseInt(limitMatch[1]),
        used: parseInt(usedMatch[1]),
        requested: parseInt(requestedMatch[1])
      };
    }

    return null;
  }

  /**
   * Check if an error is a transient server error (503, 502, etc.)
   */
  private isTransientError(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorStatus = error.status || 0;

    return (
      errorStatus === 503 ||
      errorStatus === 502 ||
      errorStatus === 504 ||
      errorMessage.includes('service unavailable') ||
      errorMessage.includes('bad gateway') ||
      errorMessage.includes('gateway timeout') ||
      errorMessage.includes('temporarily unavailable')
    );
  }

  /**
   * Check if an error indicates an invalid/unauthorized key
   */
  private isInvalidKeyError(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorStatus = error.status || 0;

    return (
      errorStatus === 400 ||
      errorStatus === 401 ||
      errorStatus === 403 ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('api key not valid')
    );
  }

  /**
   * Deactivate an invalid API key
   */
  async deactivateInvalidKey(apiKey: string, userId: string): Promise<void> {
    try {
      console.log(`[${userId}] Deactivating invalid API key`);

      const { error } = await supabaseAdmin
        .from('api_keys')
        .update({
          is_active: false,
          // being_used: false,  // COMMENTED OUT: Single key usage
          updated_at: new Date().toISOString()
        })
        .eq('key', apiKey);

      if (error) {
        console.error(`[${userId}] Error deactivating invalid API key:`, error);
      } else {
        console.log(`[${userId}] Invalid API key deactivated successfully`);
      }
    } catch (error) {
      console.error(`[${userId}] Error in deactivateInvalidKey:`, error);
    }
  }

  /**
   * Exponential backoff retry mechanism
   */
  async withExponentialBackoff<T>(
    operation: () => Promise<T>,
    userId: string,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.log(`[${userId}] Retry attempt ${attempt}, waiting ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          console.error(`[${userId}] All retry attempts failed`);
          throw error;
        }

        // Don't retry for certain error types
        if (this.isInvalidKeyError(error)) {
          console.log(`[${userId}] Not retrying for invalid key error`);
          throw error;
        }

        console.log(`[${userId}] Attempt ${attempt + 1} failed, will retry:`, (error as Error).message);
      }
    }

    throw lastError;
  }
}

// Export singleton instance
export const apiKeyManager = ApiKeyManager.getInstance();
