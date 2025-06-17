import { DEFAULT_RETRY_OPTIONS, sleep } from './retry';

interface GeminiResponse {
  isRelevant: boolean;
  confidence: number;
}

// Fetch wrapper with retries & body-read fix
export async function callGemini(prompt: string): Promise<GeminiResponse | null> {
  const rawUrl = process.env.NEXT_PUBLIC_GEMINI_API_URL!;
  const key = process.env.GEMINI_KEY!;

  // Convert relative path (e.g. "/api/gemini/analyze") into a fully qualified URL so that
  // the undici fetch implementation used by Next.js edge/serverless runtimes can parse it.
  let url: string;
  if (rawUrl.startsWith('/')) {
    // Prefer explicitly configured app URL, then fall back to Vercel-provided host, finally localhost.
    const base =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL ||
      'http://localhost:3000';
    // Ensure protocol is included (Vercel URL usually lacks it)
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
          // Hint to the analyze route that this is an internal server-to-server request
          'X-Internal-API': 'true',
        },
        body: JSON.stringify({ content: prompt }),
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
