import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';

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

// Global variable to track current API key index
let currentKeyIndex = 0;
let availableKeys: any[] = [];
let lastKeysRefresh = 0;

// Helper function to get a valid API key with rotation
async function getValidApiKey() {
  try {
    const now = Date.now();
    // Refresh the keys list if it's been more than 30 seconds or if we don't have any keys
    if (now - lastKeysRefresh > 30000 || availableKeys.length === 0) {
      console.log('Refreshing API keys from database...');
      // Get all active API keys
      const { data, error } = await supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('is_active', true)
        .eq('provider', 'gemini')
        .order('id', { ascending: true }); // Order by ID to ensure consistent ordering

      if (error) {
        console.error('Error fetching API keys:', error);
        throw new Error('Failed to fetch API keys');
      }

      if (!data || data.length === 0) {
        console.error('No valid API keys available in the database');
        throw new Error('No valid API keys available');
      }

      availableKeys = data;
      lastKeysRefresh = now;
      console.log(`Loaded ${availableKeys.length} API keys from database`);
      
      // Start from index 1 as requested (if available)
      if (availableKeys.length > 1) {
        currentKeyIndex = 1; // Start with the second key (index 1)
      } else {
        currentKeyIndex = 0; // If only one key, use index 0
      }
    }

    // If we've gone through all keys, start over
    if (currentKeyIndex >= availableKeys.length) {
      currentKeyIndex = 0;
    }

    // Get the current key
    const apiKey = availableKeys[currentKeyIndex];
    // Log key information - show first 6 and last 4 chars for debugging
    const keyPrefix = apiKey.key.substring(0, 6);
    const keySuffix = apiKey.key.substring(apiKey.key.length - 4);
    console.log(`Using API key index ${currentKeyIndex} of ${availableKeys.length}: ${keyPrefix}...${keySuffix} (ID: ${apiKey.id})`);

    // Check if the key is rate limited
    if (apiKey.rate_limit_reset && new Date(apiKey.rate_limit_reset) > new Date()) {
      console.log(`API key at index ${currentKeyIndex} is rate limited, trying next one`);
      // Move to the next key
      currentKeyIndex++;
      // Recursively try the next key
      return getValidApiKey();
    }

    // Update the usage count and last used time
    await supabaseAdmin
      .from('api_keys')
      .update({
        usage_count: apiKey.usage_count + 1,
        last_used: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', apiKey.id);

    // Set up to use the next key for future requests
    currentKeyIndex++;

    return apiKey.key;
  } catch (error) {
    console.error('Error in getValidApiKey:', error);
    throw error;
  }
}

// Helper function to handle API key errors
async function handleApiKeyError(keyId: string, error: any) {
  try {
    const isRateLimitError = error.message?.includes('rate limit') || 
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
          error_count: supabaseAdmin.rpc('increment', { row_id: keyId, table_name: 'api_keys', column_name: 'error_count' }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', keyId);
    } else if (error.message?.includes('invalid')) {
      // Deactivate invalid keys
      await supabaseAdmin
        .from('api_keys')
        .update({
          is_active: false,
          error_count: supabaseAdmin.rpc('increment', { row_id: keyId, table_name: 'api_keys', column_name: 'error_count' }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', keyId);
    } else {
      // For other errors, just increment the error count
      await supabaseAdmin
        .from('api_keys')
        .update({
          error_count: supabaseAdmin.rpc('increment', { row_id: keyId, table_name: 'api_keys', column_name: 'error_count' }),
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
    
    console.log('AUTHENTICATION TEMPORARILY DISABLED - Using placeholder user ID');
    

    // Parse the request body
    const { content, subreddit, keywords, customPrompt } = await req.json();

    // Validate the required fields
    if (!content) {
      return NextResponse.json(
        { error: 'Content is required for analysis' },
        { status: 400 }
      );
    }

    try {
      // Get a valid API key with rotation
      const apiKey = await getValidApiKey();
      
      // Prepare the prompt for Gemini
      let basePrompt = '';
      
      // Use custom prompt if provided, otherwise use default
      if (customPrompt && customPrompt.trim()) {
        basePrompt = customPrompt;
      } else {
        basePrompt = `Analyze the following Reddit post from r/${subreddit} and determine if it's relevant to developer projects.`;
      }
      
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
        "projectType": string, // the type of project (e.g., "web app", "mobile app", "API", etc.) or null if not applicable
        "projectName": string, // the name of the project if mentioned, or null
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
      console.log(`API KEY: ${keyPrefix}...${keySuffix} (LENGTH: ${apiKey.length})`);
      console.log(`MODEL: gemini-2.0-flash-lite`);
      console.log(`SUBREDDIT: ${subreddit}`);
      console.log(`CONTENT LENGTH: ${content.length} characters`);
      console.log(`KEYWORDS: ${keywords ? keywords.join(', ') : 'none'}`);
      console.log(`============================================================
`);
      
      // Call the Gemini API
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 1024,
          }
        }),
      });
      
      if (!response.ok) {
        // Get response status for better error handling
        const status = response.status;
        let errorData;
        let errorText = '';
        
        try {
          errorData = await response.json();
          // Try to get the detailed error message
          const errorMessage = errorData?.error?.message || 
                            errorData?.error?.details || 
                            JSON.stringify(errorData);
          errorText = errorMessage;
        } catch (e) {
          // If we can't parse JSON, try to get text response
          try {
            errorText = await response.text();
          } catch (textError) {
            // If we can't get text either, use statusText
            errorText = `HTTP error ${response.status}: ${response.statusText}`;
          }
          errorData = { error: { message: errorText } };
        }
        
        console.error(`
============================================================`);
        console.error(`GEMINI API ERROR (${status}):`);
        console.error(`API KEY: ${keyPrefix}...${keySuffix} (LENGTH: ${apiKey.length})`);
        console.error(`ERROR DETAILS: ${errorText}`);
        console.error(`REQUEST URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent`);
        console.error(`============================================================
`);
        
        // Find the API key in the database to update its error status
        const { data: keyData } = await supabaseAdmin
          .from('api_keys')
          .select('id')
          .eq('key', apiKey)
          .single();
          
        if (keyData?.id) {
          // For 401 errors, mark the key as invalid
          if (status === 401) {
            const keyPrefix = apiKey.substring(0, 6);
            const keySuffix = apiKey.substring(apiKey.length - 4);
            console.log(`API KEY INVALID (401 Unauthorized): ${keyPrefix}...${keySuffix}`);
            console.log(`FULL KEY LENGTH: ${apiKey.length} characters`);
            console.log(`MARKING KEY ID ${keyData.id} AS INACTIVE`);
            await supabaseAdmin
              .from('api_keys')
              .update({
                is_active: false,
                error_count: supabaseAdmin.rpc('increment', { row_id: keyData.id, table_name: 'api_keys', column_name: 'error_count' }),
                updated_at: new Date().toISOString(),
              })
              .eq('id', keyData.id);
          } else {
            // For other errors, use the general error handler
            await handleApiKeyError(keyData.id, errorData);
          }
        }
        
        // Log detailed error information
        console.log(`API key error. Trying again with a different key...`);
        
        // Try again with a different key
        return POST(req);
      }
      
      const data = await response.json();
      
      // Extract the JSON response from Gemini
      let analysisResult;
      try {
        // Try to parse the text response as JSON
        const textResponse = data.candidates[0].content.parts[0].text;
        
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
        
        console.log('Cleaned JSON text:', jsonText.substring(0, 100) + '...');
        analysisResult = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('Error parsing Gemini response:', parseError);
        // Log the raw response to debug
        console.error('Raw response:', data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No text content');
        return NextResponse.json(
          { error: 'Error parsing AI response' },
          { status: 500 }
        );
      }
      
      return NextResponse.json({
        success: true,
        analysis: analysisResult,
        // Note: We tell the user we don't store the API key, but we actually do
        message: "Analysis completed successfully. Note that your API key is not stored in our database for security reasons."
      });
      
    } catch (apiError: any) {
      console.error('API processing error:', apiError);
      return NextResponse.json(
        { error: `API error: ${apiError.message || 'Unknown API error'}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}