import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { apiKeyManager } from '../../../../utils/apiKeyManager';

// Create a Supabase admin client with service role key for bypassing RLS
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

// Helper function to get a valid API key using the new manager
async function getValidApiKey(userId: string): Promise<string> {
  // First, release any expired rate-limited keys
  await apiKeyManager.releaseExpiredRateLimitedKeys();

  // Acquire a new API key
  const apiKey = await apiKeyManager.acquireApiKey(userId, 'groq');

  if (!apiKey) {
    throw new Error('No available API keys');
  }

  return apiKey;
}

// Helper function to handle API key errors
async function handleApiKeyError(keyId: string, error: any) {
  try {
    const isRateLimitError =
      error.message?.includes('rate limit') ||
      error.message?.includes('quota') ||
      error.message?.includes('429');

    if (isRateLimitError) {
      // Set a rate limit reset time (15 minutes from now)
      const resetTime = new Date();
      resetTime.setMinutes(resetTime.getMinutes() + 15);

      await supabaseAdmin
        .from('api_keys')
        .update({
          rate_limit_reset: resetTime.toISOString(),
          error_count: supabaseAdmin.rpc('increment', {
            row_id: keyId,
            table_name: 'api_keys',
            column_name: 'error_count',
          }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', keyId);
    } else if (error.message?.includes('invalid')) {
      // Deactivate invalid keys
      await supabaseAdmin
        .from('api_keys')
        .update({
          is_active: false,
          error_count: supabaseAdmin.rpc('increment', {
            row_id: keyId,
            table_name: 'api_keys',
            column_name: 'error_count',
          }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', keyId);
    } else {
      // For other errors, just increment the error count
      await supabaseAdmin
        .from('api_keys')
        .update({
          error_count: supabaseAdmin.rpc('increment', {
            row_id: keyId,
            table_name: 'api_keys',
            column_name: 'error_count',
          }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', keyId);
    }
  } catch (dbError) {
    console.error('Error updating API key error status:', dbError);
  }
}

// POST handler for analyzing content with Gemini
export async function POST(req: Request) {
  try {
    // TEMPORARILY COMMENTED OUT AUTHENTICATION CHECK
    // Check if request is coming from internal API (from scan route)
    // We'll look for a special X-Internal-API header that our scan route will set
    const isInternalRequest = req.headers.get('X-Internal-API') === 'true';

    // Get authenticated user ID from Clerk if not an internal request
    let userId = 'temp_user_id'; // Temporary hardcoded user ID to bypass auth

    /* AUTHENTICATION CHECK TEMPORARILY DISABLED
    if (!isInternalRequest) {
      const authResult = await auth();
      userId = authResult.userId;
      
      if (!userId) {
        return NextResponse.json(
          { error: 'Unauthorized - User not authenticated' },
          { status: 401 }
        );
      }
    } else {
      // For internal requests, we bypass user authentication
      console.log('Internal API request detected - bypassing Clerk authentication');
      // Extract the user ID from the internal request header
      userId = req.headers.get('X-User-ID') || null;
      if (!userId) {
        console.warn('Internal request missing user ID - some features may be limited');
      }
    }
    */

    console.log(
      'AUTHENTICATION TEMPORARILY DISABLED - Using placeholder user ID'
    );

    // Parse the request body
    const { content, subreddit, keywords, customPrompt } = await req.json();

    // Validate the required fields
    if (!content) {
      return NextResponse.json(
        { error: 'Content is required for analysis' },
        { status: 400 }
      );
    }

    let apiKey: string | null = null;
    let attempts = 0;
    const maxAttempts = 3;
    let lastError: any = null;

    // Retry logic for API key failures
    while (attempts < maxAttempts) {
      try {
        attempts++;

        // Get a valid API key with rotation (always random)
        apiKey = await getValidApiKey(userId);

        if (!apiKey) {
          throw new Error('No API keys available');
        }

        // Prepare the prompt for Gemini – prefer caller-supplied template
        const basePrompt =
          customPrompt && customPrompt.trim() ? customPrompt.trim() : '';

        const prompt = `
      ${basePrompt}
      
      Post content:
      ${content}
      
      ${keywords && keywords.length > 0 ? `Keywords to look for: ${keywords.join(', ')}` : ''}
      
      IMPORTANT: You must respond with ONLY a raw JSON object and nothing else. Do NOT use markdown formatting, code blocks, or any explanatory text. The response must be directly parseable by JSON.parse().
      
      JSON response structure:
      {
        "isRelevant": boolean, // true if the post is relevant based on the criteria above, false otherwise
        "confidence": number, // between 0 and 1, indicating confidence in the analysis
        "keywordMatches": [string], // list of keywords that matched
        "reasoning": string // brief explanation of why this is relevant or not relevant
      }
      
      REMINDER: Return ONLY the raw JSON. No markdown, no code blocks, no explanations.
      `;

        // Show the key being used in the console (partial for security)
        const keyPrefix = apiKey.substring(0, 6);
        const keySuffix = apiKey.substring(apiKey.length - 4);
        console.log(`
============================================================`);
        console.log(`GEMINI API REQUEST DETAILS:`);
        console.log(
          `API KEY: ${keyPrefix}...${keySuffix} (LENGTH: ${apiKey.length})`
        );
        console.log(`MODEL: llama-3.1-8b-instant`);
        console.log(`SUBREDDIT: ${subreddit}`);
        console.log(`CONTENT LENGTH: ${content.length} characters`);
        console.log(`KEYWORDS: ${keywords ? keywords.join(', ') : 'none'}`);
        console.log(`============================================================
`);

        // Call the Gemini API
        const response = await fetch(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant',
              messages: [
                {
                  role: 'user',
                  content: prompt,
                },
              ],
              temperature: 0.2,
              max_tokens: 1024,
              top_p: 0.8,
            }),
          }
        );

        if (!response.ok) {
          // Get response status for better error handling
          const status = response.status;
          // Read body ONCE to avoid "Body has already been read" errors
          const errorTextRaw = await response.text();
          let errorText = errorTextRaw;
          let errorData: any = null;
          try {
            errorData = JSON.parse(errorTextRaw);
            errorText =
              errorData?.error?.message ||
              errorData?.error?.details ||
              JSON.stringify(errorData);
          } catch {
            // Not JSON – wrap in our own structure so downstream code still works
            errorData = { error: { message: errorText } };
          }

          console.error(`GEMINI API ERROR (${status}):`);
          console.error(
            `API KEY: ${keyPrefix}...${keySuffix} (LENGTH: ${apiKey.length})`
          );
          console.error(`ERROR DETAILS: ${errorText}`);
          console.error(
            `REQUEST URL: https://api.groq.com/openai/v1/chat/completions`
          );
          console.error(`============================================================
`);

          // Handle the API key error using the new manager
          await apiKeyManager.handleApiKeyError(apiKey, new Error(errorText), userId);

          // Check if this is a retryable error (400, 429, or API key issues)
          if (status === 400 || status === 429 ||
            errorText.toLowerCase().includes('expired') ||
            errorText.toLowerCase().includes('invalid') ||
            errorText.toLowerCase().includes('quota')) {

            console.log(`Retryable error detected (${status}), attempt ${attempts}/${maxAttempts}`);
            lastError = new Error(`Gemini API error (${status}): ${errorText}`);

            // Release the current API key
            if (apiKey) {
              apiKeyManager.releaseApiKey(apiKey, userId);
            }

            // If this isn't the last attempt, continue to next iteration
            if (attempts < maxAttempts) {
              console.log(`Trying with a different API key...`);
              continue;
            }
          }

          throw new Error(`Gemini API error (${status}): ${errorText}`);
        }

        const data = await response.json();

        // Extract the JSON response from Gemini
        let analysisResult;
        try {
          // Try to parse the text response as JSON
          const textResponse = data.choices[0].message.content;

          // Check if the response is wrapped in markdown code blocks
          let jsonText = textResponse;

          // Clean up markdown formatting if present
          if (jsonText.includes('```json')) {
            // Extract content between ```json and ``` markers
            const match = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
            if (match && match[1]) {
              jsonText = match[1].trim();
            }
          } else if (jsonText.includes('```')) {
            // Extract content between ``` and ``` markers
            const match = jsonText.match(/```\s*([\s\S]*?)\s*```/);
            if (match && match[1]) {
              jsonText = match[1].trim();
            }
          }

          console.log('Cleaned JSON text:', jsonText);
          analysisResult = JSON.parse(jsonText);
        } catch (parseError) {
          console.error('Error parsing Gemini response:', parseError);
          // Log the raw response to debug
          console.error(
            'Raw response:',
            data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No text content'
          );

          // Release the API key on parse error
          if (apiKey) {
            apiKeyManager.releaseApiKey(apiKey, userId);
          }

          return NextResponse.json(
            { error: 'Error parsing AI response' },
            { status: 500 }
          );
        }

        // Release the API key after successful processing
        apiKeyManager.releaseApiKey(apiKey, userId);

        return NextResponse.json({
          success: true,
          analysis: analysisResult,
          attempts: attempts,
          message:
            'Analysis completed successfully. Note that your API key is not stored in our database for security reasons.',
        });
      } catch (apiError: any) {
        console.error(`API processing error on attempt ${attempts}:`, apiError);
        lastError = apiError;

        // Release the API key on error
        if (apiKey) {
          apiKeyManager.releaseApiKey(apiKey, userId);
        }

        // If this isn't the last attempt and it's a retryable error, continue
        if (attempts < maxAttempts && (
          apiError.message?.includes('400') ||
          apiError.message?.includes('429') ||
          apiError.message?.includes('expired') ||
          apiError.message?.includes('quota')
        )) {
          console.log(`Retrying with different API key, attempt ${attempts + 1}/${maxAttempts}`);
          continue;
        }

        // If it's the last attempt or non-retryable error, break
        break;
      }
    }

    // If we've exhausted all attempts, return the last error
    console.error('All API key attempts failed');
    return NextResponse.json(
      {
        error: `API error after ${maxAttempts} attempts: ${lastError?.message || 'Unknown API error'}`,
        attempts: attempts
      },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
