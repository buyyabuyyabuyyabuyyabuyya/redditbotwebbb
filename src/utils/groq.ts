import { DEFAULT_RETRY_OPTIONS, sleep } from './retry';

interface GroqResponse {
    isRelevant: boolean;
    confidence: number;
}

interface GroqOptions {
    subreddit?: string;
    keywords?: string[];
}

// Fetch wrapper with retries
export async function callGroq(
    prompt: string,
    options: GroqOptions = {}
): Promise<GroqResponse | null> {
    const rawUrl = process.env.NEXT_PUBLIC_GROQ_API_URL || '/api/gemini/analyze';
    const key = process.env.GROQ_KEY || process.env.GEMINI_KEY!;

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
                    subreddit: options.subreddit,
                    keywords: options.keywords,
                }),
            });

            const text = await res.text();
            let json: any;
            try { json = JSON.parse(text); } catch (_) { json = null; }

            if (!res.ok) {
                throw new Error(
                    `Groq ${res.status}: ${json?.error || text?.substring(0, 80)}`
                );
            }

            const analysis = json?.analysis ?? json;
            return {
                isRelevant: analysis?.isRelevant ?? false,
                confidence: analysis?.confidence ?? 0,
            };
        } catch (err) {
            lastErr = err;
            if (attempt === DEFAULT_RETRY_OPTIONS.maxRetries) break;
            await sleep(DEFAULT_RETRY_OPTIONS.initialDelay * (attempt + 1));
        }
    }

    console.error('Groq failed:', lastErr);
    return null;
}

// Legacy export for backwards compatibility
export const callGemini = callGroq;
