import { DEFAULT_RETRY_OPTIONS, sleep } from './retry';
import { apiKeyManager } from './apiKeyManager';

interface GroqTextResponse {
    text: string;
    error?: string;
}

interface GroqTextOptions {
    userId?: string;
    maxTokens?: number;
    temperature?: number;
}

/**
 * Acquire a fresh Groq API key from Supabase using the ApiKeyManager.
 */
const fetchApiKey = async (userId?: string): Promise<string | null> => {
    try {
        // Free up any keys whose rate‐limit window has passed
        await apiKeyManager.releaseExpiredRateLimitedKeys();
        return await apiKeyManager.acquireApiKey(userId || 'system', 'groq');
    } catch (e) {
        console.error('Error acquiring Groq API key:', e);
        return null;
    }
};

// Fetch wrapper with retries for text generation
export async function callGroqForText(
    prompt: string,
    options: GroqTextOptions = {}
): Promise<GroqTextResponse> {
    let lastErr: any;

    // Attempt up to 5 different keys from the pool
    const MAX_KEY_ATTEMPTS = 5;

    for (let keyAttempt = 0; keyAttempt < MAX_KEY_ATTEMPTS; keyAttempt++) {
        const key = await fetchApiKey(options.userId);
        if (!key) {
            lastErr = new Error('No available Groq API keys');
            break;
        }

        // Try multiple attempts with the current key
        for (let attempt = 0; attempt <= DEFAULT_RETRY_OPTIONS.maxRetries; attempt++) {
            try {
                console.log(`Attempting Groq API call with key ${key.substring(0, 8)}... (attempt ${attempt + 1})`);

                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`,
                    },
                    body: JSON.stringify({
                        model: 'llama-3.1-8b-instant',
                        messages: [{
                            role: 'user',
                            content: prompt
                        }],
                        temperature: options.temperature || 0.7,
                        max_tokens: options.maxTokens || 500,
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
                        `Groq ${res.status}: ${json?.error?.message || text?.substring(0, 80)}`
                    );
                }

                // Extract text from Groq response
                const generatedText = json?.choices?.[0]?.message?.content;
                if (generatedText && typeof generatedText === 'string') {
                    console.log(`Successfully generated text with key ${key.substring(0, 8)}`);
                    // Release key asynchronously
                    apiKeyManager.releaseApiKey(key, options.userId || 'system');
                    return {
                        text: generatedText,
                    };
                }

                throw new Error('Unexpected response format from Groq');

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

    console.error('Groq text generation failed:', lastErr);
    return {
        text: '',
        error: `Groq text generation failed: ${lastErr?.message || 'Unknown error'}`,
    };
}

// Legacy export for backwards compatibility
export const callGeminiForText = callGroqForText;
