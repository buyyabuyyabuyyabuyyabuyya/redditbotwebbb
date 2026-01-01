import { RedditDiscussion } from './redditService';

export interface RelevanceScores {
  intentScore: number;
  contextMatchScore: number;
  qualityScore: number;
  finalScore: number;
  filteringReason?: string;
  engagementScore: number;
}

export interface WebsiteConfig {
  id: string;
  url: string;
  website_url?: string;
  description: string;
  website_description?: string;
  customer_segments: string[];
  keywords: string[];
  target_keywords?: string[];
  negative_keywords: string[];
  business_context_terms: string[];
  relevance_threshold: number;
  auto_poster_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

// Legacy pattern matching removed - now using comprehensive Gemini AI scoring

// All legacy pattern matching functions removed - now using comprehensive Gemini AI scoring only

export async function filterRelevantDiscussions(
  discussions: RedditDiscussion[],
  websiteConfig: WebsiteConfig,
  postedDiscussions: string[] = []
): Promise<{ discussion: RedditDiscussion; scores: RelevanceScores }[]> {
  const unpostedDiscussions = discussions.filter(discussion =>
    !postedDiscussions.includes(discussion.id)
  );

  const scoredDiscussions = [];

  console.log(`[GEMINI_FILTERING] Starting comprehensive Gemini scoring for ${unpostedDiscussions.length} discussions`);

  for (const discussion of unpostedDiscussions) {
    let scores: RelevanceScores;

    // Use Gemini AI for comprehensive relevance scoring - retry with different API keys if needed
    let attempts = 0;
    const maxAttempts = 5; // Try up to 5 different API keys

    while (attempts < maxAttempts) {
      try {
        scores = await getGeminiRelevanceScore(discussion, websiteConfig);
        break; // Success, exit retry loop
      } catch (error: any) {
        attempts++;
        console.log(`[GEMINI_FILTERING] Attempt ${attempts} failed for discussion ${discussion.id}, trying different API key...`);

        if (attempts >= maxAttempts) {
          console.error(`[GEMINI_FILTERING] All ${maxAttempts} attempts failed for discussion ${discussion.id}, skipping...`);
          continue; // Skip this discussion entirely
        }

        // Wait a bit before trying next API key
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // If we couldn't score this discussion, skip it
    if (!scores!) {
      console.log(`[GEMINI_FILTERING] Skipping discussion ${discussion.id} - no score obtained`);
      continue;
    }

    scoredDiscussions.push({ discussion, scores });
  }

  const relevantDiscussions = scoredDiscussions
    .filter(item => item.scores.finalScore >= websiteConfig.relevance_threshold)
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore);

  console.log(`[GEMINI_FILTERING] Found ${relevantDiscussions.length} relevant discussions out of ${scoredDiscussions.length} scored (threshold: ${websiteConfig.relevance_threshold}%)`);

  return relevantDiscussions;
}

async function getGeminiRelevanceScore(
  discussion: RedditDiscussion,
  websiteConfig: WebsiteConfig
): Promise<RelevanceScores> {
  try {
    // Import the API key manager and make direct Gemini API call
    // This avoids internal fetch calls that cause 401 errors in serverless environments
    const { apiKeyManager } = await import('../utils/apiKeyManager');

    let apiKey: string | null = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        // Acquire API key
        apiKey = await apiKeyManager.acquireApiKey('system', 'groq');

        if (!apiKey) {
          throw new Error('No API keys available');
        }

        console.log(`[GEMINI_SCORING] Acquired API key for discussion ${discussion.id} (attempt ${retryCount + 1})`);

        const content = `${discussion.title}\n\n${discussion.content || ''}`;
        const keywords = websiteConfig.target_keywords || websiteConfig.keywords || [];

        // Comprehensive Gemini scoring with full context
        const prompt = `You are an expert business analyst evaluating Reddit discussions for marketing relevance. Analyze this Reddit post against the website's business context and provide detailed scoring.

=== WEBSITE BUSINESS CONTEXT ===
Website URL: ${websiteConfig.website_url || websiteConfig.url || 'Not specified'}
Business Description: ${websiteConfig.website_description || websiteConfig.description || 'Not specified'}
Target Keywords: ${keywords.join(', ') || 'Not specified'}
Customer Segments: ${websiteConfig.customer_segments?.join(', ') || 'Not specified'}
Business Context Terms: ${websiteConfig.business_context_terms?.join(', ') || 'Not specified'}
Current Relevance Threshold: ${websiteConfig.relevance_threshold || 70}%

=== REDDIT DISCUSSION ANALYSIS ===
Subreddit: r/${discussion.subreddit}
Post Title: ${discussion.title}
Post Content: ${content}
Post Type: ${discussion.is_self ? 'Text Post (Self)' : 'Link Post'}
Post URL: ${discussion.url || 'Not available'}

=== SCORING INSTRUCTIONS ===
Evaluate this discussion on these criteria (0-100 scale each):

1. INTENT SCORE: Does the user show buying intent, need help, or seek recommendations?
   - Look for: problems, questions, "looking for", "need help", "recommendations"
   - Higher scores for clear pain points or solution-seeking behavior

2. CONTEXT MATCH SCORE: How well does this align with the website's business?
   - Consider target keywords, customer segments, and business context
   - Evaluate if the discussion topic relates to the website's value proposition

3. QUALITY SCORE: Is this a genuine, high-quality discussion worth engaging with?
   - Consider post length, detail level, and content quality
   - Avoid spam, low-effort posts, or overly promotional content

4. FINAL SCORE: Overall business relevance and opportunity score
   - Weighted combination of intent, context match, and quality
   - Should reflect the likelihood of generating valuable business engagement
   - DO NOT factor in upvotes or comment counts

Respond with ONLY a JSON object in this exact format (no markdown, no extra text):
{"intentScore": 0-100, "contextMatchScore": 0-100, "qualityScore": 0-100, "finalScore": 0-100, "reasoning": "Brief explanation"}`;

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
          const error = new Error(`Gemini API error: ${response.status} - ${errorText}`);
          (error as any).status = response.status;
          throw error;
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;

        if (text) {
          // Try multiple JSON extraction methods
          let scores = null;

          // Method 1: Try to find JSON object with regex
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              scores = JSON.parse(jsonMatch[0]);
            } catch (e) {
              console.log(`[GEMINI_SCORING] JSON parse failed for discussion ${discussion.id}, trying cleanup...`);
            }
          }

          // Method 2: Try to clean markdown code blocks
          if (!scores) {
            const cleanedText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            const cleanMatch = cleanedText.match(/\{[\s\S]*\}/);
            if (cleanMatch) {
              try {
                scores = JSON.parse(cleanMatch[0]);
              } catch (e) {
                console.log(`[GEMINI_SCORING] Cleaned JSON parse also failed for discussion ${discussion.id}`);
              }
            }
          }

          if (scores && scores.finalScore !== undefined) {
            console.log(`[GEMINI_SCORING] Discussion ${discussion.id} scored ${scores.finalScore}/100 by Gemini AI - ${scores.reasoning}`);

            return {
              intentScore: scores.intentScore || 0,
              contextMatchScore: scores.contextMatchScore || 0,
              qualityScore: scores.qualityScore || 0,
              finalScore: scores.finalScore || 0,
              filteringReason: scores.reasoning || undefined,
              engagementScore: scores.engagementScore || 0
            };
          }
        }

        console.error(`[GEMINI_SCORING] Invalid response for ${discussion.id}:`, text?.substring(0, 200));
        throw new Error('Invalid Gemini response format');

      } catch (error: any) {
        // Check if this is a transient error (503, 502, etc.)
        const isTransient = error.status === 503 || error.status === 502 || error.status === 504 ||
          error.message?.toLowerCase().includes('service unavailable') ||
          error.message?.toLowerCase().includes('bad gateway') ||
          error.message?.toLowerCase().includes('gateway timeout');

        if (isTransient && retryCount < maxRetries - 1) {
          console.log(`[GEMINI_SCORING] Transient error (${error.status}) for discussion ${discussion.id}, retrying in ${Math.pow(2, retryCount)} seconds...`);

          // Release the current API key before retrying
          if (apiKey) {
            await apiKeyManager.releaseApiKey(apiKey, 'system');
            apiKey = null;
          }

          // Exponential backoff: 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
          retryCount++;
          continue;
        }

        // If not transient or max retries reached, throw the error
        throw error;

      } finally {
        // Always release the API key for this attempt
        if (apiKey) {
          await apiKeyManager.releaseApiKey(apiKey, 'system');
          console.log(`[GEMINI_SCORING] Released API key for discussion ${discussion.id}`);
          apiKey = null;
        }
      }
    }

    // If we get here, all retries failed
    throw new Error(`All ${maxRetries} retry attempts failed for discussion ${discussion.id}`);

  } catch (error) {
    console.error(`[GEMINI_SCORING] Error scoring discussion ${discussion.id}:`, error);
    // No fallback - try another API key by throwing error to retry with different key
    throw error;
  }
}
