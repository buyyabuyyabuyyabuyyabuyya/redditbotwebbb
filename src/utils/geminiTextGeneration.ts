import { DEFAULT_RETRY_OPTIONS, sleep } from './retry';
import { apiKeyManager } from './apiKeyManager';

interface GeminiTextResponse {
  text: string;
  error?: string;
}

interface GeminiTextOptions {
  userId?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Acquire a fresh Gemini API key from Supabase using the ApiKeyManager.
 */
const fetchApiKey = async (userId?: string): Promise<string | null> => {
  try {
    // Free up any keys whose rate‐limit window has passed
    await apiKeyManager.releaseExpiredRateLimitedKeys();
    return await apiKeyManager.acquireApiKey(userId || 'system', 'gemini');
  } catch (e) {
    console.error('Error acquiring Gemini API key:', e);
    return null;
  }
};

// Fetch wrapper with retries for text generation
export async function callGeminiForText(
  prompt: string,
  options: GeminiTextOptions = {}
): Promise<GeminiTextResponse> {
  const rawUrl = process.env.NEXT_PUBLIC_GEMINI_API_URL!;

  // Convert relative path into a fully qualified URL
  let url: string;
  if (rawUrl.startsWith('/')) {
    const base =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL ||
      'http://localhost:3000';
    const normalizedBase = base.startsWith('http://') || base.startsWith('https://')
      ? base
      : `https://${base}`;
    url = `${normalizedBase}${rawUrl}`;
  } else {
    url = rawUrl;
  }

  let lastErr: any;

  // Attempt up to 5 different keys from the pool
  const MAX_KEY_ATTEMPTS = 5;

  for (let keyAttempt = 0; keyAttempt < MAX_KEY_ATTEMPTS; keyAttempt++) {
    const key = await fetchApiKey(options.userId);
    if (!key) {
      lastErr = new Error('No available Gemini API keys');
      break;
    }

    // Try multiple attempts with the current key
    for (let attempt = 0; attempt <= DEFAULT_RETRY_OPTIONS.maxRetries; attempt++) {
      try {
        console.log(`Attempting Gemini API call with key ${key.substring(0, 8)}... (attempt ${attempt + 1})`);

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
            'X-Internal-API': 'true',
          },
          body: JSON.stringify({
            content: prompt,
            // Add text generation specific parameters
            isTextGeneration: true,
            maxTokens: options.maxTokens || 500,
            temperature: options.temperature || 0.7,
          }),
        });

        const text = await res.text();
        let json: any;
        try { 
          json = JSON.parse(text); 
        } catch (_) { 
          json = null; 
        }

        if (!res.ok) {
          throw new Error(
            `Gemini ${res.status}: ${json?.error || text?.substring(0, 80)}`
          );
        }

        // For text generation, we expect a different response format
        if (json?.text) {
          console.log(`Successfully generated text with key ${key.substring(0, 8)}`);
          // Release key asynchronously; no need to await
          apiKeyManager.releaseApiKey(key, options.userId || 'system');
          return {
            text: json.text,
          };
        } else if (json?.error) {
          throw new Error(json.error);
        } else {
          // Fallback: try to extract text from the response
          const generatedText = json?.generatedText || json?.content || text;
          if (generatedText && typeof generatedText === 'string') {
            console.log(`Successfully generated text with key ${key.substring(0, 8)} (fallback format)`);
            // Release key asynchronously
            apiKeyManager.releaseApiKey(key, options.userId || 'system');
            return {
              text: generatedText,
            };
          }
          
          throw new Error('Unexpected response format from Gemini');
        }

      } catch (err: any) {
        lastErr = err;
        console.warn(`Attempt ${attempt + 1} with key ${key.substring(0, 8)} failed:`, err);

        // Mark the key as errored / possibly rate-limited
        await apiKeyManager.handleApiKeyError(key, err, options.userId || 'system');

        if (attempt === DEFAULT_RETRY_OPTIONS.maxRetries) {
          // Break inner retry loop and fetch a different key
          break;
        }
        await sleep(DEFAULT_RETRY_OPTIONS.initialDelay * (attempt + 1));
      }
    }

  }

  console.error('Gemini text generation failed:', lastErr);
  return {
    text: '',
    error: `Gemini text generation failed: ${lastErr?.message || 'Unknown error'}`,
  };
} 