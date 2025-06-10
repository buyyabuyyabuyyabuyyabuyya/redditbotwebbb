import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerSupabaseClient } from '../../../../utils/supabase-server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { checkAndArchiveLogs } from '../auto-archive-helper'; // Now accepts 5 parameters with archiveAll boolean

// Utility for retrying failed API requests
interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  factor: number;
  retryableStatusCodes: number[];
}

// Default retry options
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  factor: 2, // Exponential backoff factor
  retryableStatusCodes: [429, 500, 502, 503, 504], // Rate limit and server errors
};

// Sleep utility
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Calculate exponential backoff delay with jitter
const calculateBackoff = (attempt: number, options: RetryOptions) => {
  const delay = Math.min(
    options.maxDelay,
    options.initialDelay * Math.pow(options.factor, attempt)
  );
  // Add jitter (±25%)
  return delay * (0.75 + Math.random() * 0.5);
};

// Rate limit tracker to avoid hitting Reddit's limits
class RateLimitTracker {
  private requestTimes: Record<string, number[]> = {};
  private readonly windowSize = 60 * 1000; // 1 minute window
  private readonly maxRequestsPerMinute: Record<string, number> = {
    default: 60, // Default Reddit rate limit
    message: 10, // Lower limit for sending messages
    auth: 5, // Very low limit for authentication
  };

  // Check if we should throttle a request
  shouldThrottle(
    requestType: 'default' | 'message' | 'auth' = 'default'
  ): boolean {
    const now = Date.now();
    const times = this.requestTimes[requestType] || [];

    // Remove requests outside the window
    const recentTimes = times.filter((time) => now - time < this.windowSize);
    this.requestTimes[requestType] = recentTimes;

    // Check if we've hit the limit
    return recentTimes.length >= this.maxRequestsPerMinute[requestType];
  }

  // Record a request
  recordRequest(requestType: 'default' | 'message' | 'auth' = 'default'): void {
    const now = Date.now();
    if (!this.requestTimes[requestType]) {
      this.requestTimes[requestType] = [];
    }
    this.requestTimes[requestType].push(now);
  }

  // Get time until next request is allowed (in ms)
  getTimeUntilAllowed(
    requestType: 'default' | 'message' | 'auth' = 'default'
  ): number {
    if (!this.shouldThrottle(requestType)) {
      return 0;
    }

    const now = Date.now();
    const times = this.requestTimes[requestType] || [];
    if (times.length === 0) return 0;

    // Sort times and find the oldest that's still in our window
    times.sort((a, b) => a - b);
    return this.windowSize - (now - times[0]) + 100; // Add 100ms buffer
  }

  // Wait until we can make a request
  async waitUntilAllowed(
    requestType: 'default' | 'message' | 'auth' = 'default'
  ): Promise<void> {
    const waitTime = this.getTimeUntilAllowed(requestType);
    if (waitTime > 0) {
      await sleep(waitTime);
    }
  }
}

// Create a single instance of the rate limiter
const rateLimiter = new RateLimitTracker();

// Define a type for Reddit posts to avoid circular reference issues
interface RedditPost {
  id: string;
  name: string; // The fullname identifier used by Reddit API
  title: string;
  selftext: string;
  author: {
    name: string;
  };
  created_utc?: number;
  permalink?: string;
  url?: string;
  // Add other properties as needed
}

// Define a type for post analysis results
interface PostAnalysis {
  isRelevant: boolean;
  confidence: number;
  projectType: string;
  projectName: string | null;
  keywordMatches: string[];
  reasoning: string;
}

// Using the imported createServerSupabaseClient function

export async function POST(req: Request) {
  const scanExecutionStartTime = Date.now(); // CAPTURE SERVER-SIDE START TIME
  console.log('========== STARTING REDDIT BOT SCAN ==========');
  // Record the scan start time for interval calculations
  const scanStartTime = new Date();
  let allProcessedPosts: RedditPost[] = []; // Initialize for broader scope
  let allSentMessages: {
    postId: string;
    author: string;
    messageId: string | null;
  }[] = []; // Initialize for broader scope
  const supabase = createServerSupabaseClient();
  // Also create a direct admin client that bypasses RLS
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  try {
    const { userId } = auth();
    console.log(`User ID: ${userId}`);
    if (!userId) {
      console.log('ERROR: Unauthorized - No user ID found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (jsonError) {
      console.error('Error parsing request body:', jsonError);
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { configId, forceDirectQuery, startTime } = requestBody;
    // If startTime was provided, use it instead of the current time
    const effectiveScanStartTime = startTime
      ? new Date(startTime)
      : scanStartTime;
    console.log(
      `Config ID: ${configId}, Force Direct Query: ${forceDirectQuery ? 'Yes' : 'No'}`
    );

    if (!configId) {
      console.error('No config ID provided in request');
      return NextResponse.json(
        { error: 'No config ID provided' },
        { status: 400 }
      );
    }

    // Get the scan configuration
    let config;
    try {
      console.log(`Fetching scan configuration with ID: ${configId}`);

      // If forceDirectQuery is true, bypass the normal flow and use the admin client
      if (forceDirectQuery) {
        console.log(
          `Using DIRECT QUERY mode with admin client for ID: ${configId}`
        );

        // Define a type for our config with message_templates property
        type ScanConfig = {
          id: string;
          user_id: string;
          subreddit: string;
          keywords: string[];
          message_template_id: string;
          reddit_account_id: string;
          is_active: boolean;
          scan_interval: number;
          last_scan_time: string | null;
          created_at: string;
          updated_at: string;
          message_templates?: any | null; // Add this property to fix TypeScript errors
        };

        // Get the config directly using the admin client that bypasses RLS
        const { data: directData, error: directError } = await supabaseAdmin
          .from('scan_configs')
          .select(
            `
            id,
            user_id,
            subreddit,
            keywords,
            message_template_id,
            reddit_account_id,
            is_active,
            scan_interval,
            last_scan_time,
            created_at,
            updated_at
          `
          )
          .eq('id', configId)
          .single<ScanConfig>();

        if (directError) {
          console.error(`Direct query error: ${JSON.stringify(directError)}`);
          return NextResponse.json(
            { error: `Direct query error: ${directError.message}` },
            { status: 500 }
          );
        }

        if (!directData) {
          console.error(`Direct query found no config with ID: ${configId}`);
          return NextResponse.json(
            { error: `Configuration not found with direct query: ${configId}` },
            { status: 404 }
          );
        }

        console.log(
          `Direct query found config: ${JSON.stringify(directData, null, 2)}`
        );

        // Get the message template separately
        if (directData.message_template_id) {
          const { data: templateData } = await supabaseAdmin
            .from('message_templates')
            .select('*')
            .eq('id', directData.message_template_id)
            .single();

          // Add the message_templates property to match the expected structure
          directData.message_templates = templateData;
        } else {
          directData.message_templates = null;
        }

        // Use the direct data as our config
        config = directData;
        console.log(`Using direct query data as config`);

        // Skip all other database queries since we already have the config
        // Jump directly to processing the scan
      } else {
        // Use the normal flow with regular client
        console.log(`Using NORMAL FLOW for ID: ${configId}`);

        // First check if the config exists with a direct query
        console.log(
          `Checking if config exists with direct SQL query for ID: ${configId}`
        );

        // Log all scan_configs to debug
        const { data: allConfigs, error: allConfigsError } = await supabase
          .from('scan_configs')
          .select('id, subreddit')
          .limit(10);

        if (allConfigsError) {
          console.error(
            `Error fetching all configs: ${JSON.stringify(allConfigsError)}`
          );
        } else {
          console.log(
            `Found ${allConfigs?.length || 0} total configs in database:`
          );
          console.log(JSON.stringify(allConfigs, null, 2));
        }

        // Now check for the specific config
        const { count, error: countError } = await supabase
          .from('scan_configs')
          .select('*', { count: 'exact', head: true })
          .eq('id', configId);

        console.log(
          `Count query result for ID ${configId}: count=${count}, error=${JSON.stringify(countError)}`
        );

        if (countError) {
          console.error(
            `Error checking if config exists: ${JSON.stringify(countError)}`
          );
          return NextResponse.json(
            { error: `Error checking if config exists: ${countError.message}` },
            { status: 500 }
          );
        }

        if (count === 0) {
          console.error(`Scan configuration not found with ID: ${configId}`);

          // Try a direct query without count to double-check
          const { data: directCheck, error: directCheckError } =
            await supabaseAdmin
              .from('scan_configs')
              .select('id, subreddit')
              .eq('id', configId);

          console.log(
            `Direct check result: ${JSON.stringify(directCheck)}, error: ${JSON.stringify(directCheckError)}`
          );

          // Log this error to the bot_logs table
          try {
            await supabaseAdmin.from('bot_logs').insert({
              user_id: userId,
              action: 'scan_error',
              status: 'error',
              config_id: configId,
              error_message: `Scan configuration not found with ID: ${configId}`,
              created_at: new Date().toISOString(),
            });
          } catch (logError) {
            console.error('Failed to log scan error:', logError);
          }

          return NextResponse.json(
            { error: `Scan configuration not found with ID: ${configId}` },
            { status: 404 }
          );
        }

        // Get the full config with a direct query to avoid the single() error
        try {
          const { data: fullConfigData, error: fullConfigError } =
            await supabaseAdmin
              .from('scan_configs')
              .select('*')
              .eq('id', configId);

          if (fullConfigError) {
            console.error(
              `Error fetching full config: ${JSON.stringify(fullConfigError)}`
            );
            return NextResponse.json(
              {
                error: `Error fetching full config: ${fullConfigError.message}`,
              },
              { status: 500 }
            );
          }

          if (!fullConfigData || fullConfigData.length === 0) {
            console.error(`No data returned for full config query`);
            return NextResponse.json(
              { error: `No data returned for full config query` },
              { status: 404 }
            );
          }

          // Use the first item as our config
          config = fullConfigData[0];
          console.log(
            `Using full config data: ${JSON.stringify(config, null, 2)}`
          );

          // Get the message template separately
          if (config.message_template_id) {
            const { data: templateData } = await supabase
              .from('message_templates')
              .select('*')
              .eq('id', config.message_template_id)
              .single();

            // Add the message_templates property to match the expected structure
            config.message_templates = templateData;
          } else {
            config.message_templates = null;
          }
        } catch (configError) {
          console.error(`Error in config fetch: ${configError}`);
          return NextResponse.json(
            { error: `Error in config fetch: ${configError}` },
            { status: 500 }
          );
        }
      }

      // We already have the config at this point, so we can skip the additional database query
      // Just log that we're proceeding with the scan
      console.log(`Proceeding with scan using config ID: ${configId}`);
      console.log(`Config details: ${JSON.stringify(config, null, 2)}`);

      // Add a short delay to ensure any other database operations have completed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Now fetch the complete Reddit account details with credentials directly from the database
      // Instead of making an API call, use the admin client to bypass RLS
      console.log(
        `Fetching Reddit account with ID: ${config.reddit_account_id} directly from database`
      );

      const { data: redditAccount, error: redditAccountError } =
        await supabaseAdmin
          .from('reddit_accounts')
          .select('*')
          .eq('id', config.reddit_account_id)
          .single();

      if (redditAccountError) {
        console.error(
          `Error fetching Reddit account: ${JSON.stringify(redditAccountError)}`
        );
        throw new Error(
          `Failed to fetch Reddit account: ${redditAccountError.message}`
        );
      }

      if (!redditAccount) {
        console.error(
          `Reddit account not found for ID: ${config.reddit_account_id}`
        );
        throw new Error('Reddit account not found');
      }

      console.log(
        `Successfully retrieved Reddit account for ${redditAccount.username}`
      );
      config.reddit_account = redditAccount;
    } catch (error: any) {
      console.error('========== SCAN CONFIGURATION ERROR ==========');
      console.error('Error fetching scan configuration:', error);
      return NextResponse.json(
        {
          error: `Error fetching scan configuration: ${error?.message || 'Unknown error'}`,
        },
        { status: 500 }
      );
    }

    // Check if the bot is still active - do this again to ensure it hasn't been deactivated while we were fetching details
    const { data: activeCheck, error: activeCheckError } = await supabaseAdmin
      .from('scan_configs')
      .select('is_active')
      .eq('id', configId)
      .single();

    if (activeCheckError) {
      console.error(
        `Error checking if bot is still active: ${JSON.stringify(activeCheckError)}`
      );
      return NextResponse.json(
        {
          error: `Error checking if bot is still active: ${activeCheckError.message}`,
        },
        { status: 500 }
      );
    }

    // If the bot has been deactivated, stop processing
    if (!activeCheck || !activeCheck.is_active) {
      console.log(
        `Bot has been deactivated for config ID: ${configId}, stopping scan`
      );
      return NextResponse.json({
        message: `Bot is not active, scan aborted`,
        scanned: 0,
        matched: 0,
      });
    }

    // Log the start of the scan process
    console.log('========== STARTING SCAN PROCESS ==========');
    console.log(`Starting scan for subreddit: r/${config.subreddit}`);
    console.log(
      `Scan configuration: ${JSON.stringify(config, (key, value) =>
        // Don't log sensitive information
        key === 'client_secret' ||
        key === 'refresh_token' ||
        key === 'access_token'
          ? '[REDACTED]'
          : value
      )}`
    );

    await supabaseAdmin.from('bot_logs').insert([
      {
        user_id: userId,
        action: 'start_bot',
        status: 'success',
        subreddit: config.subreddit,
        config_id: configId,
        created_at: new Date().toISOString(),
      },
    ]);
    console.log(`Inserted start_bot log for r/${config.subreddit}`);

    // Check if enough time has passed since the last scan
    if (config.last_scan_time) {
      const lastScanTime = new Date(config.last_scan_time);
      const currentTime = new Date();
      const timeDiffMinutes =
        (currentTime.getTime() - lastScanTime.getTime()) / (1000 * 60);

      // If scan interval is set and not enough time has passed
      if (config.scan_interval && timeDiffMinutes < config.scan_interval) {
        const timeRemaining = Math.ceil(config.scan_interval - timeDiffMinutes);

        await supabaseAdmin.from('bot_logs').insert([
          {
            user_id: userId,
            action: 'start_scan',
            status: 'warning',
            subreddit: config.subreddit,
            config_id: configId,
            error_message: `Scan attempted too soon. Next scan available in ${timeRemaining} minutes.`,
            created_at: new Date().toISOString(),
          },
        ]);

        return NextResponse.json(
          {
            error: `Scan interval not reached. Please wait ${timeRemaining} minutes before scanning again.`,
          },
          { status: 429 }
        );
      }
    }

    // Initialize Reddit client using credentials from the database
    const redditAccount = config.reddit_account;

    if (
      !redditAccount ||
      !redditAccount.client_id ||
      !redditAccount.client_secret
    ) {
      // Log error and return
      await supabaseAdmin.from('bot_logs').insert([
        {
          user_id: userId,
          action: 'start_scan',
          status: 'error',
          subreddit: config.subreddit,
          config_id: configId,
          error_message: 'Missing Reddit API credentials',
          created_at: new Date().toISOString(),
        },
      ]);

      return NextResponse.json(
        {
          error:
            'Missing Reddit API credentials. Please update your Reddit account settings.',
        },
        { status: 400 }
      );
    }

    // Log the credentials we're using (for debugging)
    console.log(`Using Reddit account: ${redditAccount.username}`);
    console.log(`Client ID available: ${!!redditAccount.client_id}`);
    console.log(`Client Secret available: ${!!redditAccount.client_secret}`);

    // Use a consistent user agent format
    const userAgent = `web:reddit-bot-saas:v1.0.0 (by /u/${redditAccount.username})`;

    // Helper function to get Reddit OAuth token with retry logic
    const getRedditAccessToken = async () => {
      console.log('========== REDDIT AUTHENTICATION ==========');
      console.log(
        `Attempting to get Reddit access token for ${redditAccount.username}...`
      );

      // Log the authentication attempt
      await supabaseAdmin.from('bot_logs').insert([
        {
          user_id: userId,
          action: 'reddit_auth_attempt',
          status: 'info',
          subreddit: config.subreddit,
          config_id: configId,
          created_at: new Date().toISOString(),
        },
      ]);

      // Wait for rate limiting if needed
      await rateLimiter.waitUntilAllowed('auth');

      // Set up retry options specific to auth
      const authRetryOptions: RetryOptions = {
        ...DEFAULT_RETRY_OPTIONS,
        maxRetries: 2, // Fewer retries for auth to avoid account lockouts
        initialDelay: 3000, // Start with a longer delay
      };

      let lastError: Error | null = null;

      // Retry loop
      for (let attempt = 0; attempt <= authRetryOptions.maxRetries; attempt++) {
        try {
          // If this is a retry, log it
          if (attempt > 0) {
            console.log(`Retry attempt ${attempt} for authentication...`);
            await supabaseAdmin.from('bot_logs').insert([
              {
                user_id: userId,
                action: 'reddit_auth_retry',
                status: 'info',
                subreddit: config.subreddit,
                config_id: configId,
                error_message: `Retry attempt ${attempt} after error: ${lastError?.message}`,
                created_at: new Date().toISOString(),
              },
            ]);

            // Wait before retry with exponential backoff
            const backoffDelay = calculateBackoff(attempt, authRetryOptions);
            console.log(
              `Waiting ${Math.round(backoffDelay / 1000)} seconds before retry...`
            );
            await sleep(backoffDelay);
          }

          // Record this request with the rate limiter
          rateLimiter.recordRequest('auth');

          // Reddit OAuth endpoint for script app flow
          const tokenUrl = 'https://www.reddit.com/api/v1/access_token';

          // Create the auth string (client_id:client_secret)
          const authString = Buffer.from(
            `${redditAccount.client_id}:${redditAccount.client_secret}`
          ).toString('base64');

          // Log the authentication details (without sensitive info)
          console.log(`Auth attempt for account: ${redditAccount.username}`);
          console.log(
            `Using client_id: ${redditAccount.client_id.substring(0, 5)}...`
          );
          console.log(`User agent: ${userAgent}`);

          // Make the token request - using the script app approach (similar to PRAW)
          const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${authString}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': userAgent,
            },
            body: new URLSearchParams({
              grant_type: 'password',
              username: redditAccount.username,
              password: redditAccount.password,
              duration: 'permanent', // Request a permanent token
            }).toString(),
          });

          // Handle response status
          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error(
              `Reddit token error response (${tokenResponse.status}):`,
              errorText
            );

            // Check if this is a retryable error
            const isRetryable = authRetryOptions.retryableStatusCodes.includes(
              tokenResponse.status
            );

            // Log the authentication failure with detailed error
            await supabaseAdmin.from('bot_logs').insert([
              {
                user_id: userId,
                action: 'reddit_auth_error',
                status:
                  isRetryable && attempt < authRetryOptions.maxRetries
                    ? 'warning'
                    : 'error',
                subreddit: config.subreddit,
                config_id: configId,
                error_message: `Auth failed: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorText}`,
                created_at: new Date().toISOString(),
              },
            ]);

            // If this is a rate limit error, add extra delay
            if (tokenResponse.status === 429) {
              const retryAfter = tokenResponse.headers.get('Retry-After');
              const retryDelay = retryAfter
                ? parseInt(retryAfter) * 1000
                : 60000; // Default to 60s if header not present
              console.log(
                `Rate limited. Waiting ${retryDelay / 1000} seconds as specified by Reddit...`
              );
              await sleep(retryDelay);
            }

            // Throw error to trigger retry or fail
            lastError = new Error(
              `Reddit token error: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorText}`
            );

            // If not retryable or last attempt, rethrow
            if (!isRetryable || attempt === authRetryOptions.maxRetries) {
              throw lastError;
            }

            // Otherwise continue to next retry attempt
            continue;
          }

          const tokenData = await tokenResponse.json();

          if (!tokenData.access_token) {
            console.error('Token response data:', tokenData);

            // Log the missing token error
            await supabaseAdmin.from('bot_logs').insert([
              {
                user_id: userId,
                action: 'reddit_auth_error',
                status: 'error',
                subreddit: config.subreddit,
                config_id: configId,
                error_message: 'No access token received from Reddit',
                created_at: new Date().toISOString(),
              },
            ]);

            lastError = new Error('No access token received from Reddit');

            // If last attempt, throw
            if (attempt === authRetryOptions.maxRetries) {
              throw lastError;
            }

            // Otherwise continue to next retry attempt
            continue;
          }

          console.log('Successfully obtained Reddit access token');

          // Log the successful authentication
          await supabaseAdmin.from('bot_logs').insert([
            {
              user_id: userId,
              action: 'reddit_auth_success',
              status: 'success',
              subreddit: config.subreddit,
              config_id: configId,
              created_at: new Date().toISOString(),
            },
          ]);

          // Success! Return the token and exit retry loop
          return tokenData.access_token;
        } catch (error) {
          // Save the error for potential retry
          lastError = error instanceof Error ? error : new Error(String(error));

          // If this is the last attempt, log and rethrow
          if (attempt === authRetryOptions.maxRetries) {
            console.error(
              'All authentication retry attempts failed:',
              lastError
            );

            // Log the final authentication failure
            await supabaseAdmin.from('bot_logs').insert([
              {
                user_id: userId,
                action: 'reddit_auth_error',
                status: 'error',
                subreddit: config.subreddit,
                config_id: configId,
                error_message: `Authentication failed after ${attempt + 1} attempts: ${lastError.message}`,
                created_at: new Date().toISOString(),
              },
            ]);

            throw lastError;
          }

          // Otherwise continue to next retry attempt
          console.error(
            `Authentication attempt ${attempt + 1} failed:`,
            lastError
          );
        }
      }

      // This should never be reached due to the throw in the last iteration
      throw new Error('Authentication failed with no specific error');
    };

    // Helper function to make authenticated Reddit API requests with retry logic
    const redditApiRequest = async (endpoint: string, accessToken: string) => {
      console.log(`Making Reddit API request to: ${endpoint}`);
      // Determine request type for rate limiting
      const requestType = endpoint.includes('/api/compose')
        ? 'message'
        : 'default';

      // Wait for rate limiting if needed
      await rateLimiter.waitUntilAllowed(requestType);

      // Log the API request attempt
      console.log(`Making Reddit API request to: ${endpoint}`);
      await supabaseAdmin.from('bot_logs').insert([
        {
          user_id: userId,
          action: 'reddit_api_request',
          status: 'info',
          subreddit: config.subreddit,
          config_id: configId,
          error_message: `Requesting: ${endpoint}`,
          created_at: new Date().toISOString(),
        },
      ]);

      // Track last error for retry logging
      let lastError: Error | null = null;

      // Retry loop
      for (
        let attempt = 0;
        attempt <= DEFAULT_RETRY_OPTIONS.maxRetries;
        attempt++
      ) {
        try {
          // If this is a retry, log it
          if (attempt > 0) {
            console.log(`Retry attempt ${attempt} for ${endpoint}...`);
            await supabaseAdmin.from('bot_logs').insert([
              {
                user_id: userId,
                action: 'reddit_api_retry',
                status: 'info',
                subreddit: config.subreddit,
                config_id: configId,
                error_message: `Retry attempt ${attempt} for ${endpoint} after error: ${lastError?.message}`,
                created_at: new Date().toISOString(),
              },
            ]);

            // Wait before retry with exponential backoff
            const backoffDelay = calculateBackoff(
              attempt,
              DEFAULT_RETRY_OPTIONS
            );
            console.log(
              `Waiting ${Math.round(backoffDelay / 1000)} seconds before retry...`
            );
            await sleep(backoffDelay);
          }

          // Record this request with the rate limiter
          rateLimiter.recordRequest(requestType);

          // Make the API request
          const response = await fetch(`https://oauth.reddit.com${endpoint}`, {
            headers: {
              'User-Agent': userAgent,
              Authorization: `Bearer ${accessToken}`,
            },
          });

          // Handle response status
          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `Reddit API error response for ${endpoint} (${response.status}):`,
              errorText
            );

            // Check if this is a retryable error
            const isRetryable =
              DEFAULT_RETRY_OPTIONS.retryableStatusCodes.includes(
                response.status
              );

            // Log the API request failure
            await supabaseAdmin.from('bot_logs').insert([
              {
                user_id: userId,
                action: 'reddit_api_error',
                status:
                  isRetryable && attempt < DEFAULT_RETRY_OPTIONS.maxRetries
                    ? 'warning'
                    : 'error',
                subreddit: config.subreddit,
                config_id: configId,
                error_message: `API error for ${endpoint}: ${response.status} ${response.statusText} - ${errorText}`,
                created_at: new Date().toISOString(),
              },
            ]);

            // If this is a rate limit error, add extra delay based on Reddit's headers
            if (response.status === 429) {
              const retryAfter = response.headers.get('Retry-After');
              const retryDelay = retryAfter
                ? parseInt(retryAfter) * 1000
                : 60000; // Default to 60s if header not present
              console.log(
                `Rate limited. Waiting ${retryDelay / 1000} seconds as specified by Reddit...`
              );
              await sleep(retryDelay);
            }

            // Throw error to trigger retry or fail
            lastError = new Error(
              `Reddit API error: ${response.status} ${response.statusText} - ${errorText}`
            );

            // If not retryable or last attempt, rethrow
            if (!isRetryable || attempt === DEFAULT_RETRY_OPTIONS.maxRetries) {
              throw lastError;
            }

            // Otherwise continue to next retry attempt
            continue;
          }

          // Parse the response
          const data = await response.json();

          // Log the successful API request
          await supabaseAdmin.from('bot_logs').insert([
            {
              user_id: userId,
              action: 'reddit_api_success',
              status: 'success',
              subreddit: config.subreddit,
              config_id: configId,
              error_message: `Successfully called: ${endpoint}`,
              created_at: new Date().toISOString(),
            },
          ]);

          // Success! Return the data and exit retry loop
          return data;
        } catch (error) {
          // Save the error for potential retry
          lastError = error instanceof Error ? error : new Error(String(error));

          // If this is the last attempt, log and rethrow
          if (attempt === DEFAULT_RETRY_OPTIONS.maxRetries) {
            console.error(
              `All retry attempts failed for ${endpoint}:`,
              lastError
            );

            // Log the final API failure
            await supabaseAdmin.from('bot_logs').insert([
              {
                user_id: userId,
                action: 'reddit_api_error',
                status: 'error',
                subreddit: config.subreddit,
                config_id: configId,
                error_message: `API request to ${endpoint} failed after ${attempt + 1} attempts: ${lastError.message}`,
                created_at: new Date().toISOString(),
              },
            ]);

            throw lastError;
          }

          // Otherwise continue to next retry attempt
          console.error(
            `API request attempt ${attempt + 1} failed for ${endpoint}:`,
            lastError
          );
        }
      }

      // This should never be reached due to the throw in the last iteration
      throw new Error(
        `API request to ${endpoint} failed with no specific error`
      );
    };

    // Helper function to check if a subreddit exists and is accessible
    const checkSubredditAccess = async (
      subredditName: string,
      accessToken: string
    ) => {
      console.log('========== CHECKING SUBREDDIT ACCESS ==========');
      console.log(`Checking access to subreddit: r/${subredditName}`);
      try {
        console.log(`Checking access to r/${subredditName}...`);

        // Log the subreddit access check
        await supabaseAdmin.from('bot_logs').insert([
          {
            user_id: userId,
            action: 'check_subreddit_access',
            status: 'info',
            subreddit: subredditName,
            config_id: configId,
            created_at: new Date().toISOString(),
          },
        ]);

        const aboutData = await redditApiRequest(
          `/r/${subredditName}/about`,
          accessToken
        );

        if (aboutData.error || !aboutData.data) {
          console.error(
            `Error accessing r/${subredditName}:`,
            aboutData.error || 'No data returned'
          );

          // Log the subreddit access failure
          await supabaseAdmin.from('bot_logs').insert([
            {
              user_id: userId,
              action: 'check_subreddit_access',
              status: 'error',
              subreddit: subredditName,
              config_id: configId,
              error_message: `Error accessing r/${subredditName}: ${aboutData.error || 'No data returned'}`,
              created_at: new Date().toISOString(),
            },
          ]);

          return false;
        }

        // Check if the subreddit is private or restricted
        if (
          aboutData.data.subreddit_type === 'private' ||
          aboutData.data.subreddit_type === 'restricted'
        ) {
          console.log(
            `r/${subredditName} is ${aboutData.data.subreddit_type}, may have limited access`
          );

          // Log the subreddit access warning
          await supabaseAdmin.from('bot_logs').insert([
            {
              user_id: userId,
              action: 'check_subreddit_access',
              status: 'warning',
              subreddit: subredditName,
              config_id: configId,
              error_message: `Subreddit is ${aboutData.data.subreddit_type}, may have limited access`,
              created_at: new Date().toISOString(),
            },
          ]);
        }

        console.log(`Successfully accessed r/${subredditName}`);

        // Log the successful subreddit access
        await supabaseAdmin.from('bot_logs').insert([
          {
            user_id: userId,
            action: 'check_subreddit_access',
            status: 'success',
            subreddit: subredditName,
            config_id: configId,
            error_message: `Successfully accessed r/${subredditName} (type: ${aboutData.data.subreddit_type})`,
            created_at: new Date().toISOString(),
          },
        ]);

        return true;
      } catch (error) {
        console.error(`Error checking access to r/${subredditName}:`, error);

        // Log any uncaught subreddit access errors
        await supabaseAdmin.from('bot_logs').insert([
          {
            user_id: userId,
            action: 'check_subreddit_access',
            status: 'error',
            subreddit: subredditName,
            config_id: configId,
            error_message:
              error instanceof Error ? error.message : String(error),
            created_at: new Date().toISOString(),
          },
        ]);

        return false;
      }
    };

    try {
      // Get Reddit access token
      const accessToken = await getRedditAccessToken();

      // Test the connection by getting user info
      const meData = await redditApiRequest('/api/v1/me', accessToken);
      console.log(`Successfully connected to Reddit as: ${meData.name}`);

      // First check if we can access the subreddit
      const subredditAccessible = await checkSubredditAccess(
        config.subreddit,
        accessToken
      );

      if (!subredditAccessible) {
        await supabaseAdmin.from('bot_logs').insert([
          {
            user_id: userId,
            action: 'subreddit_access_error',
            status: 'error',
            subreddit: config.subreddit,
            config_id: configId,
            error_message: `Cannot access subreddit r/${config.subreddit}`,
            created_at: new Date().toISOString(),
          },
        ]);

        return NextResponse.json(
          {
            error: `Cannot access subreddit r/${config.subreddit}. It may be private, restricted, or banned.`,
          },
          { status: 403 }
        );
      }

      // Get recent posts from the subreddit
      console.log(`Fetching posts from r/${config.subreddit}...`);

      // Get posts from subreddit with pagination support (similar to PRAW approach)
      let newPosts: RedditPost[] = [];
      let after: string | null = null;
      const postsPerPage = 25;
      const maxPages = 1; // Fetch 100 posts total (25 × 4) per batch
      const postTypes = ['new']; // Can be expanded to ['new', 'hot', 'rising', 'top'] like in Python code

      // Read the 'after' parameter from the request if provided for pagination
      // This allows us to continue fetching from where we left off
      try {
        const requestData = await req.json();
        if (requestData.after) {
          after = requestData.after;
          console.log(`Continuing from pagination token: ${after}`);
        }
      } catch (parseError) {
        console.log(
          'No pagination token found in request, starting from beginning'
        );
      }

      try {
        const scanTimeoutMilliseconds = config.scan_interval * 60 * 1000; // CALCULATE TIMEOUT

        // Process each post type (currently just 'new', but can be expanded)
        for (const postType of postTypes) {
          console.log(
            `Fetching ${postType} posts from r/${config.subreddit}...`
          );

          // Use the pagination token from the request if available,
          // otherwise keep the existing 'after' value to continue pagination
          // We don't reset pagination to ensure we fetch new pages each time

          // Fetch posts with pagination
          for (let page = 0; page < maxPages; page++) {
            // TIME CHECK: See if scan interval has been reached
            if (
              Date.now() - scanExecutionStartTime >=
              scanTimeoutMilliseconds
            ) {
              console.log(
                `Scan interval of ${config.scan_interval} minutes reached. Terminating scan for configId: ${configId}.`
              );
              await supabaseAdmin.from('bot_logs').insert([
                {
                  user_id: userId,
                  action: 'scan_terminated_interval_reached',
                  status: 'info',
                  subreddit: config.subreddit,
                  config_id: configId,
                  message: `Scan terminated because scan interval of ${config.scan_interval} minutes was reached.`,
                  created_at: new Date().toISOString(),
                },
              ]);

              // Archive all logs
              console.log(
                'Archiving all logs due to scan interval termination...'
              );
              // Assuming checkAndArchiveLogs is defined elsewhere and handles these parameters
              // The auto-archive-helper.ts shows it takes (supabase, userId, configId, subreddit, archiveAll = false)
              await checkAndArchiveLogs(
                supabaseAdmin,
                userId,
                configId,
                config.subreddit,
                true
              ); // archiveAll = true

              // Update last_scan_time before exiting
              const updateResult = await supabaseAdmin
                .from('scan_configs')
                .update({ last_scan_time: new Date().toISOString() })
                .eq('id', configId);

              if (updateResult.error) {
                console.error(
                  'Failed to update last_scan_time on interval reached:',
                  updateResult.error
                );
              }

              return NextResponse.json({
                message: `Scan terminated: Interval of ${config.scan_interval} minutes reached. Logs archived.`,
                after: after, // 'after' token from the current scope
                hasMorePosts: true, // Likely true if loop is broken, but depends on Reddit API response for the *last successful* fetch
                processedPostsCount: allProcessedPosts.length,
                sentMessagesCount: allSentMessages.length,
                scanDuration: (Date.now() - scanExecutionStartTime) / 1000, // Duration in seconds
                intervalReached: true,
              });
            }

            // Construct the pagination query
            let paginationQuery = `limit=${postsPerPage}`;
            if (after) {
              paginationQuery += `&after=${after}`;
            }

            // Fetch posts from the subreddit
            const postsData = await redditApiRequest(
              `/r/${config.subreddit}/${postType}?${paginationQuery}`,
              accessToken
            );

            // Process the posts
            if (
              postsData &&
              postsData.data &&
              postsData.data.children &&
              postsData.data.children.length > 0
            ) {
              // Update the 'after' cursor for pagination
              after = postsData.data.after;

              // Convert Reddit API response to our RedditPost type
              const pagePosts = postsData.data.children.map((child: any) => ({
                id: child.data.id,
                name: child.data.name, // Important for pagination and message sending
                title: child.data.title,
                selftext: child.data.selftext || '',
                author: {
                  name: child.data.author,
                },
                created_utc: child.data.created_utc,
                permalink: child.data.permalink,
                url: `https://reddit.com${child.data.permalink}`,
              }));

              // Filter out posts with deleted authors
              const validPosts = pagePosts.filter(
                (post: RedditPost) =>
                  post.author &&
                  post.author.name &&
                  post.author.name !== '[deleted]'
              );

              // Add to our collection
              newPosts = [...newPosts, ...validPosts];

              console.log(
                `Fetched ${validPosts.length} valid posts (page ${page + 1})`
              );

              // If no more posts or no 'after' cursor, break
              if (!after) {
                break;
              }

              // Add a small delay between requests (like in Python code)
              await new Promise((resolve) => setTimeout(resolve, 1000));
            } else {
              // No more posts
              break;
            }
          }
        }

        console.log(`Total posts fetched: ${newPosts.length}`);

        // Log the successful fetch
        await supabaseAdmin.from('bot_logs').insert([
          {
            user_id: userId,
            action: 'fetch_posts',
            status: 'success',
            subreddit: config.subreddit,
            config_id: configId,
            error_message: `Fetched ${newPosts.length} posts`,
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (error) {
        console.error('Error fetching posts:', error);

        // Log the error
        await supabaseAdmin.from('bot_logs').insert([
          {
            user_id: userId,
            action: 'fetch_posts',
            status: 'error',
            subreddit: config.subreddit,
            config_id: configId,
            error_message:
              error instanceof Error ? error.message : String(error),
            created_at: new Date().toISOString(),
          },
        ]);

        throw error;
      }

      // Log the number of posts found
      console.log(
        `Found ${newPosts.length} new posts in r/${config.subreddit}`
      );

      // If no posts found, log and return
      if (newPosts.length === 0) {
        await supabaseAdmin.from('bot_logs').insert([
          {
            user_id: userId,
            action: 'scan_complete',
            status: 'info',
            subreddit: config.subreddit,
            config_id: configId,
            error_message: 'No new posts found',
            created_at: new Date().toISOString(),
          },
        ]);

        // Update last scan time even if no posts found
        const { error: updateError } = await supabase
          .from('scan_configs')
          .update({ last_scan_time: new Date().toISOString() })
          .eq('id', configId);

        if (updateError) {
          console.error('Error updating last scan time:', updateError);
        } else {
          console.log(`Updated last scan time for config ${configId}`);
        }

        return NextResponse.json({ message: 'No new posts found' });
      }

      // Process each post
      for (const post of newPosts) {
        // TIME CHECK: terminate if the scan interval has been exceeded before handling this post
        if (
          Date.now() - scanExecutionStartTime >=
          config.scan_interval * 60 * 1000
        ) {
          console.log(
            `Scan interval of ${config.scan_interval} minutes reached during post loop. Terminating scan for configId: ${configId}.`
          );
          await supabaseAdmin.from('bot_logs').insert([
            {
              user_id: userId,
              action: 'scan_terminated_interval_reached',
              status: 'info',
              subreddit: config.subreddit,
              config_id: configId,
              message: `Scan terminated during post loop because scan interval of ${config.scan_interval} minutes was reached.`,
              created_at: new Date().toISOString(),
            },
          ]);

          // Archive all logs immediately
          await checkAndArchiveLogs(
            supabaseAdmin,
            userId,
            configId,
            config.subreddit,
            true
          );

          // Update last_scan_time
          const updateResult = await supabaseAdmin
            .from('scan_configs')
            .update({ last_scan_time: new Date().toISOString() })
            .eq('id', configId);

          if (updateResult.error) {
            console.error(
              'Failed to update last_scan_time on interval reached during post loop:',
              updateResult.error
            );
          }

          return NextResponse.json({
            message: `Scan terminated during post processing: Interval of ${config.scan_interval} minutes reached. Logs archived.`,
            processedPostsCount: allProcessedPosts.length,
            sentMessagesCount: allSentMessages.length,
            scanDuration: (Date.now() - scanExecutionStartTime) / 1000, // seconds
            intervalReached: true,
          });
        }
        try {
          console.log(`Processing post: ${post.title} by ${post.author.name}`);

          // Log the post processing start
          await supabaseAdmin.from('bot_logs').insert([
            {
              user_id: userId,
              action: 'process_post',
              status: 'info',
              subreddit: config.subreddit,
              config_id: configId,
              error_message: `Processing post: ${post.id} by ${post.author.name}`,
              created_at: new Date().toISOString(),
            },
          ]);

          // Check if we've already processed this post
          const { data: existingProcessed } = await supabase
            .from('sent_messages')
            .select('id')
            .eq('user_id', userId)
            .eq('post_id', post.id)
            .maybeSingle();

          if (existingProcessed) {
            console.log(`Post ${post.id} has already been processed, skipping`);

            // Log the skip due to previous processing
            await supabaseAdmin.from('bot_logs').insert([
              {
                user_id: userId,
                action: 'process_post',
                status: 'info',
                subreddit: config.subreddit,
                config_id: configId,
                error_message: `Skipping post ${post.id} - already processed`,
                created_at: new Date().toISOString(),
              },
            ]);

            continue;
          }

          // Parse keywords properly - ensure it's always treated as an array
          let keywords: string[] = [];
          if (typeof config.keywords === 'string') {
            keywords = config.keywords
              .split(',')
              .map((k: string) => k.trim().toLowerCase());
          } else if (Array.isArray(config.keywords)) {
            keywords = config.keywords.map((k: string) =>
              k.trim().toLowerCase()
            );
          }

          // Log the keywords we're checking against
          await supabaseAdmin.from('bot_logs').insert([
            {
              user_id: userId,
              action: 'keyword_check',
              status: 'info',
              subreddit: config.subreddit,
              config_id: configId,
              error_message: `Checking post against keywords: ${keywords.join(', ')}`,
              created_at: new Date().toISOString(),
            },
          ]);

          const postTitle = post.title.toLowerCase();
          const postBody = post.selftext ? post.selftext.toLowerCase() : '';

          const matchingKeywords = keywords.filter(
            (keyword: string) =>
              postTitle.includes(keyword) || postBody.includes(keyword)
          );

          if (matchingKeywords.length === 0) {
            console.log(`No keyword matches found for post: ${post.title}`);

            // Log the no-match result
            await supabaseAdmin.from('bot_logs').insert([
              {
                user_id: userId,
                action: 'keyword_check',
                status: 'info',
                subreddit: config.subreddit,
                config_id: configId,
                error_message: `No keyword matches for post ${post.id}`,
                created_at: new Date().toISOString(),
              },
            ]);

            continue; // Skip this post if no keywords match
          }

          console.log(
            `Found matching keywords: ${matchingKeywords.join(', ')}`
          );

          // Log the successful keyword match
          await supabaseAdmin.from('bot_logs').insert([
            {
              user_id: userId,
              action: 'keyword_match',
              status: 'success',
              subreddit: config.subreddit,
              config_id: configId,
              error_message: `Matched keywords: ${matchingKeywords.join(', ')} in post ${post.id}`,
              created_at: new Date().toISOString(),
            },
          ]);

          // Check if we should use AI analysis for relevance checking
          let useAiCheck = true;
          if (config.use_ai_check === false) {
            useAiCheck = false;
          }

          let isRelevant = true;
          let aiAnalysisResult = null;

          // If AI checking is enabled, perform the analysis
          if (useAiCheck) {
            console.log('========== ANALYZING POST WITH GEMINI ==========');
            console.log(
              `Analyzing post content for r/${config.subreddit} with ${matchingKeywords.length} keywords`
            );
            try {
              // Get the message template for the AI prompt
              let aiPrompt = '';
              if (
                config.message_templates &&
                config.message_templates.ai_prompt
              ) {
                aiPrompt = config.message_templates.ai_prompt;
              }

              // Format the post content for analysis
              const postContent = `${post.title}\n\n${post.selftext || ''}`;
              const maxContentLength = 10000; // Gemini has token limits
              const truncatedContent =
                postContent.length > maxContentLength
                  ? postContent.substring(0, maxContentLength) +
                    '... (content truncated)'
                  : postContent;

              // Call the Gemini analyze endpoint
              const response = await fetch(
                new URL('/api/gemini/analyze', req.url).toString(),
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: req.headers.get('Authorization') || '', // Forward auth header
                  },
                  body: JSON.stringify({
                    content: truncatedContent,
                    subreddit: config.subreddit,
                    keywords: matchingKeywords,
                    customPrompt: aiPrompt,
                  }),
                }
              );

              if (!response.ok) {
                // Get error details for better logging
                let errorDetails = 'Unknown error';
                const status = response.status;
                console.log(`Gemini API error status: ${status}`);

                try {
                  const errorData = await response.json();
                  errorDetails = errorData.error || 'Unknown error';
                  console.log(
                    `Gemini API error details: ${JSON.stringify(errorData)}`
                  );
                } catch (e) {
                  // If not JSON, try to get text
                  errorDetails = await response.text();
                  console.log(`Gemini API error text: ${errorDetails}`);
                }

                // Log the error to database
                await supabaseAdmin.from('bot_logs').insert([
                  {
                    user_id: userId,
                    action: 'ai_analysis_error',
                    status: 'warning',
                    subreddit: config.subreddit,
                    config_id: configId,
                    error_message: `AI analysis error (${status}): ${errorDetails}`,
                    created_at: new Date().toISOString(),
                  },
                ]);

                console.log(
                  `Failed to analyze post content (${status}): ${errorDetails}`
                );
                console.log(
                  `========== END ANALYSIS: FAILURE (${status}) ==========`
                );

                // IMPORTANT: Set isRelevant to false when AI check fails
                // This is a safer approach to avoid sending messages when AI can't verify relevance
                isRelevant = false;
                console.log(
                  `Setting post relevance to FALSE due to AI analysis failure - ${status} status code`
                );
                continue; // Skip this post and move on to the next one
              } else {
                const data = await response.json();
                aiAnalysisResult = data.analysis;
                console.log(
                  `Gemini analysis successful. Result: ${data.analysis.isRelevant ? 'RELEVANT' : 'NOT RELEVANT'}`
                );
                console.log(
                  `Reason: ${data.analysis.reason || 'No reason provided'}`
                );
                console.log(`========== END ANALYSIS: SUCCESS ==========`);

                // Log successful analysis
                await supabaseAdmin.from('bot_logs').insert([
                  {
                    user_id: userId,
                    action: 'ai_analysis_success',
                    status: 'info',
                    subreddit: config.subreddit,
                    config_id: configId,
                    details: JSON.stringify({
                      postId: post.id,
                      postTitle: post.title,
                      isRelevant: data.analysis.isRelevant,
                      reason: data.analysis.reason,
                    }),
                    created_at: new Date().toISOString(),
                  },
                ]);

                // Use the AI analysis to determine relevance
                isRelevant = aiAnalysisResult.isRelevant;

                // Log the analysis result
                console.log(
                  `Analysis for post by ${post.author.name}: isRelevant=${isRelevant}, confidence=${aiAnalysisResult.confidence}`
                );

                await supabaseAdmin.from('bot_logs').insert([
                  {
                    user_id: userId,
                    action: 'ai_analysis',
                    status: isRelevant ? 'success' : 'info',
                    subreddit: config.subreddit,
                    config_id: configId,
                    error_message: `AI analysis: ${aiAnalysisResult.reasoning}`,
                    created_at: new Date().toISOString(),
                  },
                ]);
              }
            } catch (error) {
              console.error('Error analyzing post content:', error);

              // Log the error but DON'T continue with keyword matching
              await supabaseAdmin.from('bot_logs').insert([
                {
                  user_id: userId,
                  action: 'ai_analysis_error',
                  status: 'error',
                  subreddit: config.subreddit,
                  config_id: configId,
                  error_message:
                    error instanceof Error ? error.message : String(error),
                  created_at: new Date().toISOString(),
                },
              ]);

              // IMPORTANT: Set isRelevant to false when exception occurs during AI check
              // This prevents sending messages when we can't verify relevance
              isRelevant = false;
              console.log(
                `Setting post relevance to FALSE due to AI analysis exception`
              );
            }
          }

          // If the post is not relevant based on AI analysis, skip it
          if (!isRelevant) {
            console.log(
              `Post by ${post.author.name} deemed not relevant by AI analysis, skipping`
            );

            await supabaseAdmin.from('bot_logs').insert([
              {
                user_id: userId,
                action: 'skip_post',
                status: 'info',
                subreddit: config.subreddit,
                config_id: configId,
                error_message: `Skipped post ${post.id} - deemed not relevant by AI`,
                created_at: new Date().toISOString(),
              },
            ]);

            continue;
          }

          // Helper function to analyze post content using Gemini API
          const analyzePostContent = async (
            postContent: string,
            subreddit: string,
            keywords: string[]
          ): Promise<PostAnalysis> => {
            console.log('========== ANALYZING POST WITH GEMINI ==========');
            console.log(
              `Analyzing post content for r/${subreddit} with ${keywords.length} keywords`
            );
            try {
              // Check if the post content is too long
              const maxContentLength = 10000; // Gemini has token limits
              const truncatedContent =
                postContent.length > maxContentLength
                  ? postContent.substring(0, maxContentLength) +
                    '... (content truncated)'
                  : postContent;

              // Call the Gemini analyze endpoint
              const response = await fetch(
                new URL('/api/gemini/analyze', req.url).toString(),
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    // AUTHENTICATION HEADERS TEMPORARILY COMMENTED OUT TO BYPASS AUTH
                    /*
                  'X-Internal-API': 'true', // Mark this as an internal API request
                  'X-User-ID': userId, // Pass the user ID for logging purposes
                  'Authorization': req.headers.get('Authorization') || '' // Still forward auth header for compatibility
                  */
                  },
                  body: JSON.stringify({
                    content: truncatedContent,
                    subreddit,
                    keywords,
                  }),
                }
              );

              // Check for specific error codes
              if (!response.ok) {
                const errorText = await response.text();
                console.error(
                  `Failed to analyze post content (${response.status}):`,
                  errorText
                );

                // Log the Gemini API error
                await supabaseAdmin.from('bot_logs').insert([
                  {
                    user_id: userId,
                    action: 'gemini_api_error',
                    status: 'error',
                    subreddit: subreddit,
                    config_id: configId,
                    error_message: `Gemini API error (${response.status}): ${errorText}`,
                    created_at: new Date().toISOString(),
                  },
                ]);

                throw new Error(
                  `Gemini API error (${response.status}): ${errorText}`
                );
              }

              const data = await response.json();

              // Validate the analysis data
              if (
                !data.analysis ||
                typeof data.analysis.isRelevant !== 'boolean'
              ) {
                console.error('Invalid analysis data received:', data);
                throw new Error(
                  'Invalid analysis data received from Gemini API'
                );
              }

              return data.analysis;
            } catch (error) {
              console.error('Error analyzing post content:', error);

              // Log the fallback to basic keyword matching
              await supabaseAdmin.from('bot_logs').insert([
                {
                  user_id: userId,
                  action: 'fallback_keyword_matching',
                  status: 'warning',
                  subreddit: subreddit,
                  config_id: configId,
                  error_message:
                    error instanceof Error ? error.message : String(error),
                  created_at: new Date().toISOString(),
                },
              ]);

              // Fallback to basic keyword matching if AI analysis fails
              const hasKeywordMatch = keywords.some((keyword) =>
                postContent.toLowerCase().includes(keyword.toLowerCase())
              );

              return {
                isRelevant: hasKeywordMatch,
                confidence: hasKeywordMatch ? 0.7 : 0.3,
                projectType: 'unknown',
                projectName: null,
                keywordMatches: keywords.filter((keyword) =>
                  postContent.toLowerCase().includes(keyword.toLowerCase())
                ),
                reasoning: 'Basic keyword matching (AI analysis failed)',
              };
            }
          };

          // Analyze the post content using Gemini
          const postContent = `${post.title}\n\n${post.selftext || ''}`;
          const analysis = await analyzePostContent(
            postContent,
            config.subreddit,
            keywords
          );

          // Log the analysis result for debugging
          console.log(
            `Analysis for post by ${post.author.name}: isRelevant=${analysis.isRelevant}, confidence=${analysis.confidence}`
          );

          // Add to matching posts if relevant with good confidence
          if (analysis.isRelevant && analysis.confidence > 0.6) {
            // Add analysis data to the post object for logging
            (post as any).analysis = analysis;

            // Send messages to matching post authors
            // Using a separate async function to avoid circular type reference
            const sendMessageToAuthor = async (
              post: RedditPost
            ): Promise<string | null> => {
              console.log('========== SENDING MESSAGE ==========');
              console.log(`Preparing to send message to u/${post.author.name}`);
              try {
                // Check if we've already messaged this user about this post
                const { data: existingMessage, error: existingMessageError } =
                  await supabaseAdmin
                    .from('sent_messages')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('account_id', config.reddit_account_id)
                    .eq('recipient', post.author.name)
                    .eq('subreddit', config.subreddit)
                    .eq('post_id', post.id) // Add post ID to check for exact post
                    .maybeSingle(); // Use maybeSingle to avoid errors if no record found

                if (existingMessageError) {
                  console.error(
                    'Error checking for existing messages:',
                    existingMessageError
                  );
                }

                // Also check if we've messaged this user about any post in the past WITH THE SAME CONFIG
                // This allows different bot configurations to message the same user
                const { data: previousMessages, error: previousMessagesError } =
                  await supabaseAdmin
                    .from('sent_messages')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('recipient', post.author.name)
                    .eq('config_id', configId) // Added config_id check
                    .limit(1);

                if (previousMessagesError) {
                  console.error(
                    'Error checking for previous messages:',
                    previousMessagesError
                  );
                }

                // Log if we've messaged this user before with this specific config
                if (
                  previousMessages &&
                  previousMessages.length > 0 &&
                  previousMessages[0].id !== (existingMessage?.id || '')
                ) {
                  console.log(
                    `User ${post.author.name} has been messaged before about a different post with this config`
                  );
                }

                // Skip if we've already messaged about this specific post
                if (existingMessage) {
                  console.log(
                    `Already messaged ${post.author.name} about this specific post in r/${config.subreddit}`
                  );
                  return null;
                }

                // Skip if we've messaged this user before about any post (optional, based on your preference)
                // Uncomment the following if you want to strictly avoid messaging the same user twice

                if (previousMessages && previousMessages.length > 0) {
                  console.log(
                    `Already messaged ${post.author.name} about a different post, skipping`
                  );
                  return null;
                }

                // Get the analysis data if available
                const analysisData = (post as any).analysis || null;
                const analysisDataJson = analysisData
                  ? JSON.stringify(analysisData)
                  : null;

                // Prepare message content with template variables replaced
                let messageContent = config.message_templates.content
                  .replace(/\{username\}/g, post.author.name)
                  .replace(/\{subreddit\}/g, config.subreddit)
                  .replace(/\{post_title\}/g, post.title);

                // Random delay between 2–3 minutes (in ms) – handled by Edge Function
                const delayMinutes = 2 + Math.random();
                const delayMs = Math.floor(delayMinutes * 60 * 1000);

                const subject = `Regarding your post in r/${config.subreddit}`;

                // Call Supabase Edge Function to send the message
                const funcUrl =
                  process.env.NEXT_PUBLIC_SUPABASE_EDGE_FUNCTION_URL ||
                  process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(
                    '.supabase.co',
                    '.functions.supabase.co'
                  ) + '/send-message';

                const edgeResp = await fetch(funcUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                  },
                  body: JSON.stringify({
                    userId,
                    recipientUsername: post.author.name,
                    accountId: config.reddit_account_id,
                    message: messageContent,
                    subject,
                    delayMs,
                  }),
                });

                const edgeData = await edgeResp.json();

                if (!edgeResp.ok) {
                  console.error(
                    `Edge function error when messaging ${post.author.name}:`,
                    edgeData
                  );
                  throw new Error(
                    `Edge function error: ${edgeResp.status} ${edgeResp.statusText}`
                  );
                }

                // Mark message as successfully sent
                const messageSent = true;
                console.log(`Successfully sent message to u/${post.author.name}`);

                // Record the sent message with timestamp
                const { data: sentMessageData, error: sentMessageError } =
                  await supabaseAdmin
                    .from('sent_messages')
                    .insert([
                      {
                        user_id: userId,
                        account_id: config.reddit_account_id,
                        recipient: post.author.name,
                        subreddit: config.subreddit,
                        config_id: configId, // Add config_id to associate with specific bot configuration
                        post_id: post.id, // Add post ID to track which post was responded to
                        message_template: config.message_templates.content,
                        analysis_data: analysisDataJson,
                        sent_at: new Date().toISOString(),
                      },
                    ])
                    .select();

                if (sentMessageError) {
                  console.error(
                    'Error recording sent message in database:',
                    sentMessageError
                  );

                  // Log the database error
                  await supabaseAdmin.from('bot_logs').insert([
                    {
                      user_id: userId,
                      action: 'database_error',
                      status: 'error',
                      subreddit: config.subreddit,
                      config_id: configId,
                      error_message: `Error saving sent message: ${sentMessageError.message}`,
                      created_at: new Date().toISOString(),
                    },
                  ]);
                } else {
                  console.log(
                    `Successfully recorded message to ${post.author.name} in database`
                  );
                }

                // Log the message with analysis data
                await supabaseAdmin.from('bot_logs').insert([
                  {
                    user_id: userId,
                    action: 'send_message',
                    status: 'success',
                    subreddit: config.subreddit,
                    recipient: post.author.name,
                    message_template: config.message_templates.content,
                    config_id: configId,
                    analysis_data: analysisDataJson,
                    created_at: new Date().toISOString(),
                  },
                ]);

                return post.author.name;
              } catch (error: unknown) {
                console.error('Error sending message:', error);

                // Log the error
                await supabaseAdmin.from('bot_logs').insert([
                  {
                    user_id: userId,
                    action: 'send_message',
                    status: 'error',
                    subreddit: config.subreddit,
                    recipient: post.author.name,
                    message_template: config.message_templates.content,
                    config_id: configId,
                    error_message:
                      error instanceof Error ? error.message : String(error),
                    created_at: new Date().toISOString(),
                  },
                ]);

                return null;
              }
            };

            const result = await sendMessageToAuthor(post);
            if (result) {
              console.log(`Sent message to ${result}`);
            }
          }
        } catch (error) {
          console.error(`Error analyzing post by ${post.author.name}:`, error);
        }
      }

      // Update last scan time for this configuration
      console.log('Updating last scan time in database...');
      const { error: updateError } = await supabaseAdmin
        .from('scan_configs')
        .update({ last_scan_time: new Date().toISOString() })
        .eq('id', configId);

      if (updateError) {
        console.error('Error updating last scan time:', updateError);

        // Log the error
        await supabaseAdmin.from('bot_logs').insert([
          {
            user_id: userId,
            action: 'update_scan_time',
            status: 'error',
            config_id: configId,
            error_message: `Failed to update last_scan_time: ${updateError.message}`,
            created_at: new Date().toISOString(),
          },
        ]);
      } else {
        console.log(`Updated last scan time for config ${configId}`);
      }

      // Log the scan batch completion
      console.log('========== SCAN BATCH COMPLETED SUCCESSFULLY ==========');
      console.log(`Posts processed in this batch: ${newPosts.length}`);
      console.log(
        `Next pagination token: ${after || 'None (end of available posts)'}`
      );

      await supabaseAdmin.from('bot_logs').insert([
        {
          user_id: userId,
          action: 'scan_complete',
          status: 'success',
          subreddit: config.subreddit,
          config_id: configId,
          details: JSON.stringify({
            postsProcessed: newPosts.length,
            hasMorePosts: after !== null,
            paginationToken: after,
          }),
          created_at: new Date().toISOString(),
        },
      ]);
      console.log('Scan completion logged to database.');

      // Synchronize the message count after sending messages
      try {
        console.log('Synchronizing message count with sent_messages table...');
        const syncResponse = await fetch(
          process.env.NEXT_PUBLIC_APP_URL + '/api/user/update-message-count',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId }),
          }
        );

        if (syncResponse.ok) {
          const syncData = await syncResponse.json();
          console.log(`Message count synchronized: ${syncData.message_count}`);
        } else {
          console.error('Failed to synchronize message count');
        }
      } catch (syncError) {
        console.error('Error synchronizing message count:', syncError);
      }

      // Check and archive logs using the helper function
      try {
        console.log('Checking if logs need to be archived...');

        // Call the helper function to check and archive logs if needed
        // Using the function imported at the top of the file
        await checkAndArchiveLogs(
          supabaseAdmin,
          userId,
          configId,
          config.subreddit,
          true
        ); // Pass true to archive all logs except start_bot

        // Calculate the scan duration and check if we should continue based on the scan_interval
        const scanEndTime = new Date();
        const scanDurationMs =
          scanEndTime.getTime() - effectiveScanStartTime.getTime();
        const scanDurationMinutes = Math.floor(scanDurationMs / (60 * 1000));
        console.log(
          `Scan duration: ${scanDurationMinutes} minutes (${scanDurationMs}ms)`
        );

        // Get the latest scan_interval setting
        const { data: latestConfig } = await supabaseAdmin
          .from('scan_configs')
          .select('scan_interval, is_active')
          .eq('id', configId)
          .single();

        const scanInterval =
          latestConfig?.scan_interval || config.scan_interval;
        const isActive =
          latestConfig?.is_active !== undefined ? latestConfig.is_active : true;

        // Check if the bot is still active and if we should continue based on scan_interval
        const shouldContinue = isActive && scanInterval > 0;

        // Insert a new "Start Bot" action log to continue the bot operation
        console.log(
          `Creating new Start Bot log entry (shouldContinue=${shouldContinue}, scanInterval=${scanInterval})...`
        );
        await supabaseAdmin.from('bot_logs').insert([
          {
            user_id: userId,
            action: 'start_bot',
            status: 'success',
            subreddit: config.subreddit,
            config_id: configId,
            error_message: shouldContinue
              ? `Bot automatically restarted after successful scan (interval: ${scanInterval}min)`
              : `Scan completed successfully. Bot ${isActive ? 'will wait for next interval' : 'is no longer active'}`,
            created_at: new Date().toISOString(),
          },
        ]);
        console.log('Created new Start Bot log entry successfully.');

        // Update the last_scan_time in the scan_configs table
        await supabaseAdmin
          .from('scan_configs')
          .update({ last_scan_time: new Date().toISOString() })
          .eq('id', configId);
        console.log('Updated last_scan_time in scan_configs table.');

        // Calculate time remaining until next scan
        const scanIntervalMs = scanInterval * 60 * 1000;
        const scanDurationMinutesReal = scanDurationMs / (60 * 1000);

        // Check if the scan used up the entire interval
        const hasRemainingTime = scanDurationMinutesReal < scanInterval;

        console.log(`Scan completed successfully for r/${config.subreddit}.`);
        console.log(
          `Scan took ${scanDurationMinutesReal.toFixed(2)} minutes of ${scanInterval} minute interval.`
        );

        if (hasRemainingTime) {
          console.log(
            `Scan interval (${scanInterval} min) not fully used - ${(scanInterval - scanDurationMinutesReal).toFixed(2)} minutes remaining.`
          );
        } else {
          console.log(
            `Scan used entire interval of ${scanInterval} minutes. Will wait for next interval.`
          );
        }

        // Calculate remaining time values for the response
        const timeUntilNextScanMs = hasRemainingTime ? 0 : scanIntervalMs; // If time remains, run again immediately (0)
        const timeUntilNextScanMinutes = hasRemainingTime ? 0 : scanInterval;

        // Return a success response with the 'after' token if available and scan timing information
        return NextResponse.json({
          success: true,
          message: 'Scan completed successfully',
          after: after, // Include the 'after' token for pagination
          hasMorePosts: after !== null, // Indicate if there are more posts to fetch
          scanDuration: scanDurationMs,
          scanInterval: scanInterval,
          timeUntilNextScan: timeUntilNextScanMs,
          timeUntilNextScanMinutes: timeUntilNextScanMinutes,
          hasRemainingTime: hasRemainingTime,
          isActive: isActive,
        });
      } catch (archiveError) {
        console.error('Error during archive check:', archiveError);

        // Even if archive fails, return a success response for the scan itself
        return NextResponse.json({
          success: true,
          message: 'Scan completed successfully, but log archiving failed',
          after: after,
          hasMorePosts: after !== null,
        });
      }
    } catch (redditError) {
      console.error('========== REDDIT API ERROR ==========');
      console.error('Reddit API error:', redditError);

      // Detailed error logging for debugging
      if (redditError instanceof Error) {
        console.error(`Error name: ${redditError.name}`);
        console.error(`Error message: ${redditError.message}`);
        console.error(`Error stack: ${redditError.stack}`);
      }

      // Log the error to the database
      try {
        await supabaseAdmin.from('bot_logs').insert([
          {
            user_id: userId, // userId is in scope from the outer function
            action: 'reddit_api_error',
            status: 'error',
            subreddit: config?.subreddit || 'unknown', // config may be undefined
            config_id: configId || 'unknown', // configId may be undefined
            error_message:
              redditError instanceof Error
                ? redditError.message
                : String(redditError),
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (logError) {
        console.error('Failed to log Reddit API error:', logError);
      }

      // Return appropriate error message
      const errorMessage =
        redditError instanceof Error
          ? redditError.message
          : String(redditError);

      if (
        errorMessage.includes('401') ||
        errorMessage.includes('403') ||
        errorMessage.includes('auth')
      ) {
        return NextResponse.json(
          {
            error:
              'Reddit authentication failed. Please check your Reddit account credentials.',
          },
          { status: 401 }
        );
      } else if (
        errorMessage.includes('429') ||
        errorMessage.includes('rate limit')
      ) {
        return NextResponse.json(
          { error: 'Reddit rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      } else if (
        errorMessage.includes('404') ||
        errorMessage.includes('not found')
      ) {
        return NextResponse.json(
          {
            error:
              'Subreddit not found or is private. Please check the subreddit name.',
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: `Reddit API error: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('========== SCAN ERROR ==========');
    console.error('Scan error:', error);

    // Get the user ID from the auth context again to ensure it's in scope
    const { userId } = auth();

    // Extract configId from request body to ensure it's in scope
    let errorConfigId = 'unknown';
    let errorSubreddit = 'unknown';

    try {
      // Try to get configId from the request body
      const reqBody = await req.clone().json();
      errorConfigId = reqBody.configId || 'unknown';
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
    }

    // Log the error to the database
    try {
      await supabaseAdmin.from('bot_logs').insert([
        {
          user_id: userId || 'unknown',
          action: 'scan_error',
          status: 'error',
          subreddit: errorSubreddit,
          config_id: errorConfigId,
          error_message: error instanceof Error ? error.message : String(error),
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    // Check for specific Reddit API errors
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes('401') ||
      errorMessage.includes('403') ||
      errorMessage.includes('auth')
    ) {
      return NextResponse.json(
        {
          error:
            'Reddit authentication failed. Please check your Reddit account credentials.',
        },
        { status: 401 }
      );
    } else if (
      errorMessage.includes('429') ||
      errorMessage.includes('rate limit')
    ) {
      return NextResponse.json(
        { error: 'Reddit rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    } else if (
      errorMessage.includes('404') ||
      errorMessage.includes('not found')
    ) {
      return NextResponse.json(
        {
          error:
            'Subreddit not found or is private. Please check the subreddit name.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: `Failed to scan subreddit: ${errorMessage}` },
      { status: 500 }
    );
  }
}
