// Shared retry helpers
export const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelay: 1000,
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
