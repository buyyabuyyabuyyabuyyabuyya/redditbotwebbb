import { RedditDiscussion } from './redditService';
import { GeminiQuotaManager } from './geminiQuotaManager';

export interface RelevanceScores {
  intentScore: number;
  contextMatchScore: number;
  qualityScore: number;
  engagementScore: number;
  finalScore: number;
  filteringReason?: string;
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

// Intent-based filtering patterns
const INTENT_PATTERNS = {
  problemStatements: [
    "i can't", "struggling with", "issue with", "problem with", "having trouble",
    "can't figure out", "difficulty with", "stuck with", "need help"
  ],
  seekingRecommendations: [
    "best", "recommend", "suggestions", "alternatives", "looking for",
    "what should i", "which one", "any ideas", "advice on"
  ],
  questions: [
    "how", "what", "where", "why", "when", "which", "who",
    "anyone know", "does anyone", "has anyone"
  ],
  experienceSharing: [
    "anyone tried", "has anyone used", "experience with", "thoughts on",
    "reviews of", "opinions on"
  ]
};

// Business context indicators
const BUSINESS_CONTEXT_INDICATORS = [
  "business", "company", "startup", "entrepreneur", "marketing", "sales",
  "customers", "clients", "revenue", "growth", "productivity", "efficiency",
  "tools", "software", "platform", "service", "solution"
];

// Quality indicators
const QUALITY_INDICATORS = {
  positive: [
    "detailed", "specific", "examples", "experience", "tried", "used",
    "working on", "building", "developing"
  ],
  negative: [
    "spam", "promotion", "advertisement", "selling", "buy now", "click here",
    "limited time", "special offer"
  ]
};

export function calculateRelevanceScore(
  discussion: RedditDiscussion,
  websiteConfig: WebsiteConfig
): RelevanceScores {
  const content = `${discussion.title} ${discussion.content}`.toLowerCase();
  
  // 1. Intent Score (25%)
  const intentScore = calculateIntentScore(content);
  
  // 2. Context Match Score (35%)
  const contextMatchScore = calculateContextMatchScore(content, websiteConfig);
  
  // 3. Quality Score (25%)
  const qualityScore = calculateQualityScore(discussion, content);
  
  // 4. Engagement Score (15%)
  const engagementScore = calculateEngagementScore(discussion);
  
  // Calculate final weighted score
  const finalScore = Math.round(
    (intentScore * 0.25) + 
    (contextMatchScore * 0.35) + 
    (qualityScore * 0.25) + 
    (engagementScore * 0.15)
  );
  
  // Determine filtering reason if score is low
  let filteringReason: string | undefined;
  if (finalScore < websiteConfig.relevance_threshold) {
    if (intentScore < 30) filteringReason = "Low intent score - not seeking help/recommendations";
    else if (contextMatchScore < 30) filteringReason = "Poor context match - not relevant to business";
    else if (qualityScore < 30) filteringReason = "Low quality post - spam or promotional";
    else filteringReason = "Below relevance threshold";
  }
  
  return {
    intentScore,
    contextMatchScore,
    qualityScore,
    engagementScore,
    finalScore,
    filteringReason
  };
}

function calculateIntentScore(content: string): number {
  let score = 0;
  
  // Check for problem statements (40 points)
  const problemCount = INTENT_PATTERNS.problemStatements.filter(pattern => 
    content.includes(pattern)
  ).length;
  score += Math.min(problemCount * 20, 40);
  
  // Check for seeking recommendations (30 points)
  const recommendationCount = INTENT_PATTERNS.seekingRecommendations.filter(pattern => 
    content.includes(pattern)
  ).length;
  score += Math.min(recommendationCount * 15, 30);
  
  // Check for questions (20 points)
  const questionCount = INTENT_PATTERNS.questions.filter(pattern => 
    content.includes(pattern)
  ).length;
  score += Math.min(questionCount * 10, 20);
  
  // Check for experience sharing (10 points)
  const experienceCount = INTENT_PATTERNS.experienceSharing.filter(pattern => 
    content.includes(pattern)
  ).length;
  score += Math.min(experienceCount * 5, 10);
  
  return Math.min(score, 100);
}

function calculateContextMatchScore(content: string, config: WebsiteConfig): number {
  let score = 0;
  
  // Check for negative keywords (should reduce score)
  const negativeKeywordMatches = config.negative_keywords?.some((keyword: string) => 
    content.includes(keyword.toLowerCase())
  ) || false;
  if (negativeKeywordMatches) score -= 40;
  
  // Check for target keywords
  const keywordMatches = config.keywords?.some((keyword: string) => 
    content.includes(keyword.toLowerCase())
  ) || false;
  score += Math.min(keywordMatches ? 40 : 0, 40);
  
  // Check for business context terms
  const contextMatches = config.business_context_terms?.some((term: string) => 
    content.includes(term.toLowerCase())
  ) || false;
  score += Math.min(contextMatches ? 30 : 0, 30);
  
  // Check general business indicators (20 points)
  const businessIndicatorMatches = BUSINESS_CONTEXT_INDICATORS.filter(indicator => 
    content.includes(indicator)
  ).length;
  score += Math.min(businessIndicatorMatches * 5, 20);
  
  // Check customer segments
  const segmentMatches = config.customer_segments?.some((segment: string) => 
    content.includes(segment.toLowerCase())
  ) || false;
  score += Math.min(segmentMatches ? 10 : 0, 10);
  
  return Math.min(score, 100);
}

function calculateQualityScore(discussion: RedditDiscussion, content: string): number {
  let score = 50; // Base score
  
  // Self posts are higher quality for discussions
  if (discussion.is_self) score += 20;
  
  // Check for positive quality indicators
  const positiveMatches = QUALITY_INDICATORS.positive.filter(indicator => 
    content.includes(indicator)
  ).length;
  score += Math.min(positiveMatches * 5, 20);
  
  // Check for negative quality indicators
  const negativeMatches = QUALITY_INDICATORS.negative.filter(indicator => 
    content.includes(indicator)
  ).length;
  score -= negativeMatches * 10;
  
  // Content length scoring
  if (discussion.content && discussion.content.length > 200) score += 10;
  if (discussion.content && discussion.content.length > 500) score += 5;
  
  // Penalize very short posts
  if (discussion.content && discussion.content.length < 50) score -= 15;
  
  return Math.max(0, Math.min(score, 100));
}

function calculateEngagementScore(discussion: RedditDiscussion): number {
  const score = discussion.score || 0;
  const comments = discussion.num_comments || 0;
  
  // Calculate engagement ratio
  const engagementRatio = comments > 0 ? comments / Math.max(score, 1) : 0;
  
  let engagementScore = 0;
  
  // Score based on absolute numbers
  if (score >= 10) engagementScore += 20;
  if (score >= 50) engagementScore += 20;
  if (comments >= 5) engagementScore += 20;
  if (comments >= 20) engagementScore += 20;
  
  // Bonus for good engagement ratio (indicates discussion)
  if (engagementRatio > 0.1) engagementScore += 20;
  
  return Math.min(engagementScore, 100);
}

export async function filterRelevantDiscussions(
  discussions: RedditDiscussion[],
  websiteConfig: WebsiteConfig,
  postedDiscussions: string[] = [],
  useGeminiScoring: boolean = true
): Promise<{ discussion: RedditDiscussion; scores: RelevanceScores }[]> {
  const unpostedDiscussions = discussions.filter(discussion => 
    !postedDiscussions.includes(discussion.id)
  );

  const scoredDiscussions = [];

  for (const discussion of unpostedDiscussions) {
    let scores: RelevanceScores;
    
    if (useGeminiScoring) {
      // Use Gemini AI for relevance scoring
      scores = await getGeminiRelevanceScore(discussion, websiteConfig);
    } else {
      // Fallback to basic pattern matching
      scores = calculateRelevanceScore(discussion, websiteConfig);
    }
    
    scoredDiscussions.push({ discussion, scores });
  }

  return scoredDiscussions
    .filter(item => item.scores.finalScore >= websiteConfig.relevance_threshold)
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore);
}

async function getGeminiRelevanceScore(
  discussion: RedditDiscussion,
  websiteConfig: WebsiteConfig
): Promise<RelevanceScores> {
  const quotaManager = new GeminiQuotaManager();
  
  // Check quota before making request
  const quotaCheck = await quotaManager.canMakeRequest();
  if (!quotaCheck.allowed) {
    console.log(`[GEMINI_SCORING] Quota exceeded: ${quotaCheck.reason}`);
    return calculateRelevanceScore(discussion, websiteConfig);
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://redditoutreach.com';
    const response = await fetch(`${baseUrl}/api/gemini/relevance-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-API': 'true',
      },
      body: JSON.stringify({
        postTitle: discussion.title,
        postContent: discussion.content || '',
        subreddit: discussion.subreddit,
        websiteConfig: {
          website_url: websiteConfig.website_url || websiteConfig.url,
          website_description: websiteConfig.website_description || websiteConfig.description,
          target_keywords: websiteConfig.target_keywords || websiteConfig.keywords,
          negative_keywords: websiteConfig.negative_keywords,
          customer_segments: websiteConfig.customer_segments,
          relevance_threshold: websiteConfig.relevance_threshold
        }
      }),
    });

    if (!response.ok) {
      console.warn(`[GEMINI_SCORING] Failed to get Gemini score for ${discussion.id}, falling back to basic scoring`);
      return calculateRelevanceScore(discussion, websiteConfig);
    }

    const data = await response.json();
    
    if (data.success && data.scores) {
      console.log(`[GEMINI_SCORING] Discussion ${discussion.id} scored ${data.scores.finalScore} by Gemini AI`);
      await quotaManager.recordRequest();
      return data.scores;
    } else {
      console.warn(`[GEMINI_SCORING] Invalid Gemini response for ${discussion.id}, falling back to basic scoring`);
      return calculateRelevanceScore(discussion, websiteConfig);
    }
  } catch (error) {
    // Check if it's a quota exceeded error
    if (error instanceof Error && error.message.includes('429')) {
      console.error(`[GEMINI_SCORING] Quota exceeded for ${discussion.id}:`, error);
      await quotaManager.recordQuotaExceeded();
    } else {
      console.error(`[GEMINI_SCORING] Error scoring discussion ${discussion.id}:`, error);
    }
    return calculateRelevanceScore(discussion, websiteConfig);
  }
}
