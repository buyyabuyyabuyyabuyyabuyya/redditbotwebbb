export const SUBREDDIT_PREFIX = 'subreddit:';

function normalizeSubredditName(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/^r\//i, '')
    .replace(/^\//, '')
    .replace(/\s+/g, '')
    .toLowerCase();

  if (!normalized) return null;
  if (!/^[a-z0-9_]{2,32}$/.test(normalized)) return null;
  return normalized;
}

export function decodeWebsiteConfigCollections(
  businessContextTerms: string[] = []
) {
  const targetSubreddits: string[] = [];
  const filteredBusinessContextTerms: string[] = [];

  for (const term of businessContextTerms) {
    if (typeof term !== 'string') continue;
    if (term.startsWith(SUBREDDIT_PREFIX)) {
      const parsed = normalizeSubredditName(
        term.slice(SUBREDDIT_PREFIX.length)
      );
      if (parsed && !targetSubreddits.includes(parsed)) {
        targetSubreddits.push(parsed);
      }
      continue;
    }

    filteredBusinessContextTerms.push(term);
  }

  return {
    businessContextTerms: filteredBusinessContextTerms,
    targetSubreddits,
  };
}

export function mergeWebsiteConfigCollections(
  businessContextTerms: string[] = [],
  targetSubreddits: string[] = []
) {
  const normalizedBusinessTerms = businessContextTerms
    .map((term) => term.trim())
    .filter(Boolean)
    .filter((term) => !term.startsWith(SUBREDDIT_PREFIX));

  const normalizedSubreddits = targetSubreddits
    .map((subreddit) => normalizeSubredditName(subreddit))
    .filter((subreddit): subreddit is string => Boolean(subreddit));

  const encodedSubreddits = Array.from(new Set(normalizedSubreddits)).map(
    (subreddit) => `${SUBREDDIT_PREFIX}${subreddit}`
  );

  return [...normalizedBusinessTerms, ...encodedSubreddits];
}

export function getWebsiteConfigSubreddits(
  websiteConfig:
    | { business_context_terms?: string[]; target_subreddits?: string[] }
    | null
    | undefined,
  fallback: string[] = ['saas', 'entrepreneur', 'startups']
) {
  if (!websiteConfig) return fallback;

  if (
    Array.isArray(websiteConfig.target_subreddits) &&
    websiteConfig.target_subreddits.length > 0
  ) {
    const normalized = websiteConfig.target_subreddits
      .map((subreddit) => normalizeSubredditName(subreddit))
      .filter((subreddit): subreddit is string => Boolean(subreddit));
    if (normalized.length > 0) return normalized;
  }

  const decoded = decodeWebsiteConfigCollections(
    websiteConfig.business_context_terms || []
  );
  return decoded.targetSubreddits.length > 0
    ? decoded.targetSubreddits
    : fallback;
}
