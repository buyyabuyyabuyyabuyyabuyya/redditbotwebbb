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

// Helper function to get a valid API key using the manager
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

// POST handler for generating Reddit replies with Gemini
export async function POST(req: Request) {
  try {
    // TEMPORARILY COMMENTED OUT AUTHENTICATION CHECK
    const isInternalRequest = req.headers.get('X-Internal-API') === 'true';
    let userId = 'temp_user_id'; // Temporary hardcoded user ID to bypass auth

    console.log('AUTHENTICATION TEMPORARILY DISABLED - Using placeholder user ID');

    // Parse the request body
    const {
      postTitle,
      postContent,
      subreddit,
      tone = 'pseudo-advice marketing',
      maxLength = 500,
      keywords = []
    } = await req.json();

    // Proactively truncate post content to stay under TPM limits
    // User requested 3,500 character limit as a safeguard
    const truncatedPostContent = (postContent || '').substring(0, 3500);

    // Validate the required fields
    if (!postTitle || !postContent) {
      return NextResponse.json(
        { error: 'Post title and content are required for reply generation' },
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

        // Prepare the prompt for generating Reddit replies
        const prompt = `
You are an expert at writing engaging Reddit comments that add value to discussions. Generate a thoughtful reply to the following Reddit post.

Post Title: ${postTitle}

Post Content: ${truncatedPostContent}

Subreddit: r/${subreddit || 'unknown'}

${keywords.length > 0 ? `Keywords to incorporate naturally: ${keywords.join(', ')}` : ''}

Reply Guidelines:
- Tone: ${tone} (adjust your writing style accordingly)
- Maximum length: ${maxLength} characters
- Be authentic and conversational
- Add genuine value to the discussion
- Avoid being overly promotional or spammy
- Use Reddit-appropriate language and formatting
- Include relevant insights, questions, or experiences
- Be respectful and constructive

IMPORTANT: You must respond with ONLY a raw JSON object and nothing else. Do NOT use markdown formatting, code blocks, or any explanatory text. The response must be directly parseable by JSON.parse().

JSON response structure:
{
  "reply": string, // the generated Reddit comment text
  "confidence": number, // between 0 and 1, indicating confidence in the reply quality
  "tone_used": string, // the actual tone reflected in the reply
  "character_count": number, // length of the generated reply
  "keywords_used": [string] // list of keywords that were naturally incorporated
}

REMINDER: Return ONLY the raw JSON. No markdown, no code blocks, no explanations.
      `;

        // Show the key being used in the console (partial for security)
        const keyPrefix = apiKey.substring(0, 6);
        const keySuffix = apiKey.substring(apiKey.length - 4);
        console.log(`
============================================================`);
        console.log(`GEMINI REPLY GENERATION REQUEST:`);
        console.log(`API KEY: ${keyPrefix}...${keySuffix} (LENGTH: ${apiKey.length})`);
        console.log(`MODEL: llama-3.1-8b-instant`);
        console.log(`SUBREDDIT: r/${subreddit}`);
        console.log(`POST TITLE: ${postTitle.substring(0, 50)}...`);
        console.log(`TONE: ${tone}`);
        console.log(`MAX LENGTH: ${maxLength}`);
        console.log(`KEYWORDS: ${keywords.join(', ') || 'none'}`);
        console.log(`============================================================`);

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
              temperature: 0.7,
              max_tokens: Math.min(maxLength * 2, 1024),
              top_p: 0.9,
            }),
          }
        );

        if (!response.ok) {
          const status = response.status;
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
            errorData = { error: { message: errorText } };
          }

          console.error(`GEMINI API ERROR (${status}):`);
          console.error(`API KEY: ${keyPrefix}...${keySuffix} (LENGTH: ${apiKey.length})`);
          console.error(`ERROR DETAILS: ${errorText}`);
          console.error(`============================================================`);

          // Handle the API key error using the manager
          await apiKeyManager.handleApiKeyError(apiKey, new Error(errorText), userId);

          // If it's an expired key error, mark it as inactive
          if (errorText.toLowerCase().includes('expired') || errorText.toLowerCase().includes('api key expired')) {
            await supabaseAdmin
              .from('api_keys')
              .update({
                is_active: false,
                updated_at: new Date().toISOString(),
              })
              .eq('key', apiKey);
          }

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

            // If this is a 429, try to extract wait time from error
            let waitTime = 2000; // Default retry delay
            if (errorText.includes('Please try again in')) {
              const match = errorText.match(/Please try again in ([\d.]+)s/);
              if (match && match[1]) {
                waitTime = (parseFloat(match[1]) + 0.5) * 1000;
                console.log(`[GEMINI_REPLY] Rate limited. Pausing for specified ${waitTime / 1000}s...`);
              }
            }

            // If this isn't the last attempt, wait and continue to next iteration
            if (attempts < maxAttempts) {
              console.log(`Waiting ${waitTime / 1000}s before trying different API key...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
          }

          throw new Error(`Gemini API error (${status}): ${errorText}`);
        }

        const data = await response.json();

        // Extract the JSON response from Gemini
        let replyResult;
        try {
          const textResponse = data.choices[0].message.content;
          let jsonText = textResponse;

          // Clean up markdown formatting if present
          if (jsonText.includes('```json')) {
            const match = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
            if (match && match[1]) {
              jsonText = match[1].trim();
            }
          } else if (jsonText.includes('```')) {
            const match = jsonText.match(/```\s*([\s\S]*?)\s*```/);
            if (match && match[1]) {
              jsonText = match[1].trim();
            }
          }

          console.log('Cleaned JSON text:', jsonText);
          replyResult = JSON.parse(jsonText);

          // Validate the response structure
          if (!replyResult.reply || typeof replyResult.reply !== 'string') {
            throw new Error('Invalid reply structure - missing or invalid reply text');
          }

          // Ensure character count is accurate
          replyResult.character_count = replyResult.reply.length;

        } catch (parseError) {
          console.error('Error parsing Gemini response:', parseError);
          console.error(
            'Raw response:',
            data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No text content'
          );

          // Release the API key on parse error
          if (apiKey) {
            apiKeyManager.releaseApiKey(apiKey, userId);
          }

          return NextResponse.json(
            { error: 'Error parsing AI response for reply generation' },
            { status: 500 }
          );
        }

        // Release the API key after successful processing
        apiKeyManager.releaseApiKey(apiKey, userId);

        return NextResponse.json({
          success: true,
          reply: replyResult,
          message: 'Reddit reply generated successfully.',
          attempts: attempts
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
