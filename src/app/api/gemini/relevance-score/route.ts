import { NextResponse } from 'next/server';

import { apiKeyManager } from '../../../../utils/apiKeyManager';

export async function POST(req: Request) {
  const userId = 'system-auto-poster'; // System identifier for logging
  let apiKey: string | null = null;

  try {
    // Parse request body
    const { postTitle, postContent, subreddit, websiteConfig } = await req.json();

    if (!postTitle || !websiteConfig) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: postTitle, websiteConfig'
      }, { status: 400 });
    }

    // Acquire API key from pool
    apiKey = await apiKeyManager.acquireApiKey(userId, 'groq');
    if (!apiKey) {
      console.warn('[GEMINI_RELEVANCE] No API keys available, falling back to basic scoring');
      return NextResponse.json({
        success: false,
        error: 'No API keys available',
        fallback: true
      }, { status: 503 });
    }

    // Create scoring prompt
    const prompt = `
You are an AI that scores Reddit discussions for business relevance. Analyze this Reddit post and provide relevance scores.

WEBSITE CONTEXT:
- URL: ${websiteConfig.website_url || 'N/A'}
- Description: ${websiteConfig.website_description || 'N/A'}
- Target Keywords: ${websiteConfig.target_keywords?.join(', ') || 'N/A'}
- Negative Keywords: ${websiteConfig.negative_keywords?.join(', ') || 'N/A'}
- Customer Segments: ${websiteConfig.customer_segments?.join(', ') || 'N/A'}
- Relevance Threshold: ${websiteConfig.relevance_threshold || 70}

REDDIT POST:
- Subreddit: r/${subreddit || 'unknown'}
- Title: ${postTitle}
- Content: ${postContent || 'No content'}

SCORING CRITERIA:
1. Intent Score (0-100): Is the user seeking help, recommendations, or solutions?
2. Context Match Score (0-100): How well does this match the website's business context?
3. Quality Score (0-100): Is this a genuine, high-quality discussion?
4. Engagement Score (0-100): Does this have good engagement potential?

IMPORTANT:
- Score 0-30: Not relevant
- Score 31-60: Somewhat relevant  
- Score 61-80: Relevant
- Score 81-100: Highly relevant

Respond with ONLY a JSON object in this exact format:
{
  "intentScore": <number>,
  "contextMatchScore": <number>, 
  "qualityScore": <number>,
  "engagementScore": <number>,
  "finalScore": <number>,
  "filteringReason": "<string or null>"
}

The finalScore should be a weighted average: (intentScore * 0.25) + (contextMatchScore * 0.35) + (qualityScore * 0.25) + (engagementScore * 0.15)
If finalScore < ${websiteConfig.relevance_threshold || 70}, provide a filteringReason explaining why.`;

    // Call Groq API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{
          role: 'user',
          content: prompt
        }],
        temperature: 0.1,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const text = result.choices[0].message.content;

    // Parse JSON response
    let scores;
    try {
      // Extract JSON from response (handle potential markdown formatting)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      scores = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[GEMINI_RELEVANCE] Failed to parse Gemini response:', text);
      throw new Error('Invalid JSON response from Gemini');
    }

    // Validate scores structure
    const requiredFields = ['intentScore', 'contextMatchScore', 'qualityScore', 'engagementScore', 'finalScore'];
    for (const field of requiredFields) {
      if (typeof scores[field] !== 'number' || scores[field] < 0 || scores[field] > 100) {
        throw new Error(`Invalid ${field}: ${scores[field]}`);
      }
    }

    console.log(`[GEMINI_RELEVANCE] Successfully scored post: ${scores.finalScore}/100`);

    // Release API key back to pool
    if (apiKey) {
      await apiKeyManager.releaseApiKey(apiKey, userId);
    }

    return NextResponse.json({
      success: true,
      scores: {
        intentScore: Math.round(scores.intentScore),
        contextMatchScore: Math.round(scores.contextMatchScore),
        qualityScore: Math.round(scores.qualityScore),
        engagementScore: Math.round(scores.engagementScore),
        finalScore: Math.round(scores.finalScore),
        filteringReason: scores.filteringReason || null
      }
    });

  } catch (error: any) {
    console.error('[GEMINI_RELEVANCE] Error:', error);

    // Handle API key errors
    if (apiKey) {
      await apiKeyManager.handleApiKeyError(apiKey, error, userId);
    }

    // Check if it's a rate limit or API key error
    const isRateLimitError = error.message?.includes('429') ||
      error.message?.includes('rate limit') ||
      error.message?.includes('quota');

    const isApiKeyError = error.message?.includes('API key') ||
      error.message?.includes('invalid') ||
      error.message?.includes('expired');

    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      fallback: true,
      errorType: isRateLimitError ? 'rate_limit' : isApiKeyError ? 'api_key' : 'unknown'
    }, { status: isRateLimitError ? 429 : isApiKeyError ? 401 : 500 });
  }
}
