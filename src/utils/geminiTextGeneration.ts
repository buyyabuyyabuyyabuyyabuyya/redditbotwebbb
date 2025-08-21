import { DEFAULT_RETRY_OPTIONS, sleep } from './retry';

interface GeminiTextResponse {
  text: string;
  error?: string;
}

interface GeminiTextOptions {
  userId?: string;
  maxTokens?: number;
  temperature?: number;
}

// Multiple API keys for fallback
const getGeminiKeys = (): string[] => {
  const keys: string[] = [];
  
  // Primary key
  if (process.env.GEMINI_KEY) {
    keys.push(process.env.GEMINI_KEY);
  }
  
  // Additional fallback keys
  if (process.env.GEMINI_KEY_2) {
    keys.push(process.env.GEMINI_KEY_2);
  }
  
  if (process.env.GEMINI_KEY_3) {
    keys.push(process.env.GEMINI_KEY_3);
  }
  
  if (process.env.GEMINI_KEY_4) {
    keys.push(process.env.GEMINI_KEY_4);
  }
  
  if (process.env.GEMINI_KEY_5) {
    keys.push(process.env.GEMINI_KEY_5);
  }
  
  return keys;
};

// Fetch wrapper with retries for text generation
export async function callGeminiForText(
  prompt: string,
  options: GeminiTextOptions = {}
): Promise<GeminiTextResponse> {
  const rawUrl = process.env.NEXT_PUBLIC_GEMINI_API_URL!;
  const keys = getGeminiKeys();
  
  if (keys.length === 0) {
    return {
      text: '',
      error: 'No Gemini API keys configured'
    };
  }

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

  // Try each API key
  for (const key of keys) {
    // Try multiple attempts with each key
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
            return {
              text: generatedText,
            };
          }
          
          throw new Error('Unexpected response format from Gemini');
        }

      } catch (err) {
        lastErr = err;
        console.warn(`Attempt ${attempt + 1} with key ${key.substring(0, 8)} failed:`, err);
        
        if (attempt === DEFAULT_RETRY_OPTIONS.maxRetries) {
          // Try next key
          break;
        }
        
        await sleep(DEFAULT_RETRY_OPTIONS.initialDelay * (attempt + 1));
      }
    }
  }

  console.error('All Gemini API keys failed:', lastErr);
  return {
    text: '',
    error: `All API keys failed: ${lastErr?.message || 'Unknown error'}`,
  };
} 