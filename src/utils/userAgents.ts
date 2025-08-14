// User Agent utility functions for Reddit bot accounts

export interface UserAgentConfig {
  enabled: boolean;
  type: string;
  custom?: string;
}

// Predefined User Agent strings with realistic, up-to-date versions
export const USER_AGENT_PRESETS = {
  default: 'Reddit Bot SaaS',
  chrome_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  chrome_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  firefox_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  firefox_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  safari_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  edge_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  mobile_ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  mobile_android: 'Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
} as const;

export type UserAgentType = keyof typeof USER_AGENT_PRESETS;

/**
 * Generate a User Agent string based on configuration
 */
export function generateUserAgent(config: UserAgentConfig): string {
  if (!config.enabled) {
    return USER_AGENT_PRESETS.default;
  }

  if (config.type === 'custom') {
    return config.custom || USER_AGENT_PRESETS.default;
  }

  const preset = USER_AGENT_PRESETS[config.type as UserAgentType];
  return preset || USER_AGENT_PRESETS.default;
}

/**
 * Parse User Agent string to extract browser information
 */
export function parseUserAgent(userAgent: string): {
  browser: string;
  os: string;
  device: string;
} {
  const ua = userAgent.toLowerCase();
  
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Desktop';

  // Detect browser
  if (ua.includes('chrome') && !ua.includes('edg')) {
    browser = 'Chrome';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('edg')) {
    browser = 'Edge';
  }

  // Detect OS
  if (ua.includes('windows')) {
    os = 'Windows';
  } else if (ua.includes('macintosh') || ua.includes('mac os x')) {
    os = 'macOS';
  } else if (ua.includes('iphone') || ua.includes('ipad')) {
    os = 'iOS';
    device = 'Mobile';
  } else if (ua.includes('android')) {
    os = 'Android';
    device = 'Mobile';
  } else if (ua.includes('linux')) {
    os = 'Linux';
  }

  // Detect mobile
  if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) {
    device = 'Mobile';
  }

  return { browser, os, device };
}

/**
 * Validate User Agent string format
 */
export function validateUserAgent(userAgent: string): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!userAgent || userAgent.trim().length === 0) {
    issues.push('User Agent cannot be empty');
  }

  if (userAgent.length > 500) {
    issues.push('User Agent is too long (max 500 characters)');
  }

  if (userAgent.length < 10) {
    issues.push('User Agent is too short (min 10 characters)');
  }

  // Check for suspicious patterns
  if (userAgent.toLowerCase().includes('bot') && !userAgent.includes('Reddit Bot SaaS')) {
    issues.push('Contains "bot" keyword which may be flagged');
  }

  if (userAgent.toLowerCase().includes('crawler') || userAgent.toLowerCase().includes('spider')) {
    issues.push('Contains crawler/spider keywords which may be flagged');
  }

  // Check for basic structure
  if (!userAgent.includes('Mozilla') && userAgent !== 'Reddit Bot SaaS') {
    issues.push('Does not follow standard User Agent format');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Get User Agent type display name
 */
export function getUserAgentDisplayName(type: string): string {
  const displayNames: Record<string, string> = {
    default: 'Default',
    chrome_windows: 'Chrome (Windows)',
    chrome_mac: 'Chrome (macOS)',
    firefox_windows: 'Firefox (Windows)',
    firefox_mac: 'Firefox (macOS)',
    safari_mac: 'Safari (macOS)',
    edge_windows: 'Edge (Windows)',
    mobile_ios: 'Mobile (iOS)',
    mobile_android: 'Mobile (Android)',
    custom: 'Custom'
  };

  return displayNames[type] || 'Unknown';
}

/**
 * Get User Agent badge text for UI
 */
export function getUserAgentBadgeText(type: string): string {
  const badgeText: Record<string, string> = {
    default: 'DEFAULT',
    chrome_windows: 'CHROME',
    chrome_mac: 'CHROME',
    firefox_windows: 'FIREFOX',
    firefox_mac: 'FIREFOX',
    safari_mac: 'SAFARI',
    edge_windows: 'EDGE',
    mobile_ios: 'MOBILE',
    mobile_android: 'MOBILE',
    custom: 'CUSTOM'
  };

  return badgeText[type] || 'USER AGENT';
}