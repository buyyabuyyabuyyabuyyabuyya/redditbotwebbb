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
  const apiKey = await apiKeyManager.acquireApiKey(userId, 'gemini');
  
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
      tone = 'helpful', 
      maxLength = 500,
      keywords = []
    } = await req.json();

    // Validate the required fields
    if (!postTitle || !postContent) {
      return NextResponse.json(
        { error: 'Post title and content are required for reply generation' },
        { status: 400 }
      );
    }

    let apiKey: string | null = null;
    try {
      // Get a valid API key with rotation
      apiKey = await getValidApiKey(userId);

      // Prepare the prompt for generating Reddit replies
      const prompt = `
You are an expert at writing engaging Reddit comments that add value to discussions. Generate a thoughtful reply to the following Reddit post.

Post Title: ${postTitle}

Post Content: ${postContent}

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
      console.log(`MODEL: gemini-2.0-flash-lite`);
      console.log(`SUBREDDIT: r/${subreddit}`);
      console.log(`POST TITLE: ${postTitle.substring(0, 50)}...`);
      console.log(`TONE: ${tone}`);
      console.log(`MAX LENGTH: ${maxLength}`);
      console.log(`KEYWORDS: ${keywords.join(', ') || 'none'}`);
      console.log(`============================================================`);

      // Call the Gemini API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.7, // Higher temperature for more creative replies
              topP: 0.9,
              topK: 40,
              maxOutputTokens: Math.min(maxLength * 2, 1024), // Allow some buffer for JSON structure
            },
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

        throw new Error(`Gemini API error (${status}): ${errorText}`);
      }

      const data = await response.json();

      // Extract the JSON response from Gemini
      let replyResult;
      try {
        const textResponse = data.candidates[0].content.parts[0].text;
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
      });

    } catch (apiError: any) {
      console.error('API processing error:', apiError);
      // Release the API key on error
      if (apiKey) {
        apiKeyManager.releaseApiKey(apiKey, userId);
      }
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
