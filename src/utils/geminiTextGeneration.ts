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

// Fetch wrapper with retries for text generation
export async function callGeminiForText(
  prompt: string,
  options: GeminiTextOptions = {}
): Promise<GeminiTextResponse> {
  const rawUrl = process.env.NEXT_PUBLIC_GEMINI_API_URL!;
  const key = process.env.GEMINI_KEY!;

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

  for (let attempt = 0; attempt <= DEFAULT_RETRY_OPTIONS.maxRetries; attempt++) {
    try {
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
        return {
          text: json.text,
        };
      } else if (json?.error) {
        return {
          text: '',
          error: json.error,
        };
      } else {
        // Fallback: try to extract text from the response
        const generatedText = json?.generatedText || json?.content || text;
        if (generatedText && typeof generatedText === 'string') {
          return {
            text: generatedText,
          };
        }
        
        throw new Error('Unexpected response format from Gemini');
      }

    } catch (err) {
      lastErr = err;
      if (attempt === DEFAULT_RETRY_OPTIONS.maxRetries) break;
      await sleep(DEFAULT_RETRY_OPTIONS.initialDelay * (attempt + 1));
    }
  }

  console.error('Gemini text generation failed:', lastErr);
  return {
    text: '',
    error: lastErr?.message || 'Failed to generate text after multiple attempts',
  };
} 