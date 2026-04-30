export interface WebsiteReplyContext {
  name?: string;
  website_name?: string;
  url?: string;
  website_url?: string;
  description?: string;
  website_description?: string;
  ai_description?: string;
  target_keywords?: string[];
  customer_segments?: string[];
  business_context_terms?: string[];
}

export interface NormalizedReplyContext {
  productName: string;
  productUrl: string;
  productDescription: string;
  customerSegments: string[];
  contextTerms: string[];
  keywords: string[];
}

export interface BridgeReplyPromptInput {
  postTitle: string;
  postContent: string;
  subreddit?: string;
  tone?: string;
  maxLength?: number;
  keywords?: string[];
  websiteConfig?: WebsiteReplyContext;
  outputFormat: 'json' | 'text';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function deriveNameFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname.split('.')[0] || 'the product';
  } catch {
    return 'the product';
  }
}

export function normalizeProductContext(
  websiteConfig: WebsiteReplyContext = {},
  fallbackKeywords: string[] = []
): NormalizedReplyContext {
  const productUrl = websiteConfig.website_url || websiteConfig.url || '';
  const productName =
    websiteConfig.name ||
    websiteConfig.website_name ||
    (productUrl ? deriveNameFromUrl(productUrl) : 'the product');
  const productDescription =
    websiteConfig.website_description ||
    websiteConfig.description ||
    websiteConfig.ai_description ||
    'No product description provided.';
  const configKeywords = asStringArray(websiteConfig.target_keywords);

  return {
    productName,
    productUrl,
    productDescription,
    customerSegments: asStringArray(websiteConfig.customer_segments),
    contextTerms: asStringArray(websiteConfig.business_context_terms),
    keywords: Array.from(new Set([...configKeywords, ...fallbackKeywords])),
  };
}

export function buildBridgeReplyPrompt(input: BridgeReplyPromptInput): string {
  const maxLength = input.maxLength || 500;
  const truncatedPostContent = (input.postContent || '').substring(0, 3500);
  const context = normalizeProductContext(input.websiteConfig, input.keywords || []);
  const productMention = context.productUrl
    ? `${context.productName} (${context.productUrl})`
    : context.productName;

  const outputInstructions =
    input.outputFormat === 'json'
      ? `IMPORTANT: Return ONLY a raw JSON object. No markdown, no code block, no explanatory text.

JSON response structure:
{
  "reply": string,
  "confidence": number,
  "tone_used": string,
  "character_count": number,
  "keywords_used": [string]
}`
      : 'Return only the final Reddit reply text. No markdown wrapper, no labels, no extra commentary.';

  return `
You write Reddit replies for a managed posting network. The goal is value-first product discovery: solve the OP's problem first, then recommend the product only when it genuinely fits.

PRODUCT CONTEXT:
Name: ${context.productName}
URL: ${context.productUrl || 'Not provided'}
Description: ${context.productDescription}
Customer segments: ${context.customerSegments.join(', ') || 'Not specified'}
Business context terms: ${context.contextTerms.join(', ') || 'Not specified'}
Keywords to incorporate naturally if relevant: ${context.keywords.join(', ') || 'None'}

REDDIT POST:
Subreddit: r/${input.subreddit || 'unknown'}
Title: ${input.postTitle}
Content: ${truncatedPostContent || 'No content provided'}

BRIDGE METHOD:
1. Diagnose the root pain behind the post, not just the literal words. Look for time pressure, money constraints, confusion, loneliness, risk, technical friction, or lack of options.
2. Map that pain to one specific value point from the product description.
3. Write a concise reply that gives the OP a practical next step, then naturally bridges to ${productMention} as one option to evaluate.
4. Include exactly one secondary free tip, resource, or recommendation that is not the product. It can be a subreddit, search phrase, checklist, YouTube channel, open-source tool, habit, or general tactic.

ANGLE SELECTION:
- If the post is emotional, use the Empathy Angle: acknowledge the specific frustration or fear before suggesting anything.
- If the post is technical or execution-focused, use the Efficiency Angle: summarize the likely bottleneck and give a direct path forward.

STYLE RULES:
- Tone target: ${input.tone || 'helpful, conversational, Reddit-native'}.
- Maximum length: ${maxLength} characters.
- Sound like a helpful Redditor, not a brand account.
- Be specific to the post. Avoid canned openings and vary the first sentence based on the OP's actual situation.
- Do not start with "Great post", "Love your honesty", "This is exactly", or generic praise.
- Do not use corporate language such as "our solution", "we help you", "click here", "book a demo", or "revolutionary".
- Do not fabricate personal experience, product ownership, or customer status. Do not say "I use this", "I found this", "I built this", or "I was in your shoes" unless that fact is explicitly provided in the input.
- Keep the product mention transparent and low-pressure, e.g. "one option worth comparing is..." or "this may fit because...".
- Integrate the URL in the recommendation sentence; do not paste it as a standalone CTA.
- If the product is not a real fit for the post, give the free helpful advice and make the product mention very light or omit it.

${outputInstructions}
`.trim();
}
