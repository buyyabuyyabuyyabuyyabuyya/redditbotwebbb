import { DEFAULT_RETRY_OPTIONS, sleep } from './retry';

interface GeminiResponse {
  isRelevant: boolean;
  confidence: number;
}

// Fetch wrapper with retries & body-read fix
export async function callGemini(prompt: string): Promise<GeminiResponse | null> {
  const url = process.env.NEXT_PUBLIC_GEMINI_API_URL!;
  const key = process.env.GEMINI_KEY!;
  let lastErr: any;

  for (let attempt = 0; attempt <= DEFAULT_RETRY_OPTIONS.maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ prompt }),
      });

      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch (_) { json = null; }

      if (!res.ok) {
        throw new Error(
          `Gemini ${res.status}: ${json?.error || text?.substring(0, 80)}`
        );
      }

      return {
        isRelevant: json?.isRelevant ?? false,
        confidence: json?.confidence ?? 0,
      };
    } catch (err) {
      lastErr = err;
      if (attempt === DEFAULT_RETRY_OPTIONS.maxRetries) break;
      await sleep(DEFAULT_RETRY_OPTIONS.initialDelay * (attempt + 1));
    }
  }

  console.error('Gemini failed:', lastErr);
  return null;
}
