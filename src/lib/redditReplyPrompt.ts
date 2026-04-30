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
  includeLink?: boolean;
}

const FORBIDDEN_REPLY_OPENING_PATTERNS = [
  /^i\s+totally\s+understand\s+your\s+struggle\b/i,
  /^i\s+agree\s+that\b.{0,120}\bis\s+hard\b/i,
  /^i['’]?m\s+sorry\s+to\s+hear\s+about\s+your\s+situation\b/i,
  /^that\s+sounds\s+like\s+a\s+tough\s+challenge\b/i,
  /^that\s+sounds\s+(really\s+)?(hard|tough|rough|frustrating|challenging)\b/i,
];

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

export function startsWithForbiddenReplyOpening(reply: string): boolean {
  const normalizedReply = reply.trim();
  return FORBIDDEN_REPLY_OPENING_PATTERNS.some((pattern) => pattern.test(normalizedReply));
}

export function enforceContextFirstReplyOpening(reply: string): string {
  const trimmedReply = reply.trim();

  if (!startsWithForbiddenReplyOpening(trimmedReply)) {
    return trimmedReply;
  }

  const withoutFirstSentence = trimmedReply
    .replace(/^[^.!?]{0,220}[.!?]\s*/, '')
    .trim();

  return withoutFirstSentence || trimmedReply;
}

export function buildBridgeReplyPrompt(input: BridgeReplyPromptInput): string {
  const maxLength = input.maxLength || 500;
  const truncatedPostContent = (input.postContent || '').substring(0, 3500);
  const context = normalizeProductContext(input.websiteConfig, input.keywords || []);
  const includeLink = input.includeLink !== false; // Default to true

  const productMention = includeLink && context.productUrl
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

  const linkInstructions = includeLink 
    ? `- Integrate the URL (${context.productUrl}) in the recommendation sentence; do not paste it as a standalone CTA.`
    : `- DO NOT include any https:// URLs or links. 
- Instead, use a "Human Search Phrase" to guide the user to find the product.
- Example: "Check out ${context.productName} (just search for it on Google)."
- Example: "I've been using ${context.productName}—you can find it easily with a quick search."
- Sound like a cautious user who is avoiding spam filters.`;

  return `
You write Reddit replies for a managed posting network. The goal is value-first product discovery: solve the OP's problem first, then recommend the product only when it genuinely fits.

PRODUCT CONTEXT:
Name: ${context.productName}
${includeLink ? `URL: ${context.productUrl || 'Not provided'}` : 'URL: [DISABLED - Do not include]'}
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
4. End with exactly one secondary free tip, resource, or recommendation that is not the product. It can be a subreddit, search phrase, checklist, YouTube channel, open-source tool, habit, or general tactic.

ANGLE SELECTION:
- If the post is emotional, use the Empathy Angle: name the exact concrete frustration or fear from the post, then move into the useful point. No generic sympathy.
- If the post is technical or execution-focused, use the Efficiency Angle: summarize the likely bottleneck and give a direct path forward.

CONTEXT-FIRST OPENING RULES:
- The first sentence must jump directly into the OP's topic, action, or bottleneck. Do not use introductory filler. Do not apologize or sympathize generically. Jump straight to the context of the user's problem.
- Never start with any of these bot-fingerprint phrases or close variants:
  - "I totally understand your struggle..."
  - "I agree that [Topic] is hard..."
  - "I'm sorry to hear about your situation..."
  - "That sounds like a tough challenge..."
- Use one of these safe opener patterns:
  - Topic Hook: "For [specific topic from the post], the annoying part is usually..."
  - Action Hook: "If you're [specific action from the post], the thing I'd check first is..."
  - Direct Solution Hook: "Have you checked out ${context.productName}? It may fit here because..."
  - Bottleneck Hook: "The bottleneck here is probably [specific pain point], not [surface-level issue]."

STYLE RULES:
- Tone target: ${input.tone || 'helpful, conversational, Reddit-native'}.
- Maximum length: ${maxLength} characters.
- Sound like a helpful Redditor, not a brand account.
- Be specific to the post. Avoid canned openings and vary the first sentence based on the OP's actual situation.
- Do not start with "Great post", "Love your honesty", "This is exactly", or generic praise.
- Do not use corporate language such as "our solution", "we help you", "click here", "book a demo", or "revolutionary".
- Use lazy human grammar: prefer contractions like "don't", "it's", "you're", and "I'd". It's okay to start one sentence with "So..." or "Actually..." if it sounds natural, but don't overdo it.
- Do not fabricate personal experience, product ownership, or customer status. Do not say "I use this", "I found this", "I built this", "I recently stumbled upon", or "I was in your shoes" unless that fact is explicitly provided in the input. (EXCEPTION: You MAY use the "I've been using" search phrase from the link instructions if includeLink is disabled, as it sounds like a cautious user recommendation).
- Make the product bridge feel like a useful discovery/comparison, not a sales pitch. Prefer phrasing like "worth checking", "one thing I'd compare", "this may fit because...", or "it lines up with the problem because...".
${linkInstructions}
- Put the secondary unrelated helpful tip at the end, e.g. "Also, try r/[subreddit] for..." or "Also, search [phrase] before you pick a tool."
- If the product is not a real fit for the post, give the free helpful advice and make the product mention very light or omit it.

${outputInstructions}
`.trim();
}
