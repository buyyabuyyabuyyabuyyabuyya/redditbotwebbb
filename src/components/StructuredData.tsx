'use client';

export default function StructuredData() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'RedditOutreach',
    applicationCategory: 'BusinessApplication',
    description:
      'Automate your Reddit comment outreach with AI-ranked discussion discovery, comment templates, and server-managed auto-posters.',
    operatingSystem: 'Web Browser',
    url: 'https://redditoutreach.com',
    offers: {
      '@type': 'Offer',
      category: 'subscription',
    },
    provider: {
      '@type': 'Organization',
      name: 'RedditOutreach Team',
      url: 'https://redditoutreach.com',
    },
    featureList: [
      'Automated Reddit comment outreach',
      'Subreddit targeting',
      'Comment template personalization',
      'Analytics and tracking',
      'Comment campaign automation',
      'Reddit account management',
    ],
    screenshot: 'https://redditoutreach.com/icon-512x512.png',
    softwareVersion: '1.0',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '150',
    },
  };

  const websiteData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'RedditOutreach',
    url: 'https://redditoutreach.com',
    description:
      'A Reddit comment outreach platform for finding relevant discussions, drafting replies, and running comment-only campaigns.',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://redditoutreach.com/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };

  const organizationData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'RedditOutreach',
    url: 'https://redditoutreach.com',
    logo: 'https://redditoutreach.com/icon-512x512.png',
    description:
      'Provider of Reddit comment automation and outreach solutions for businesses and marketers.',
    foundingDate: '2024',
    knowsAbout: [
      'Reddit automation',
      'Social media marketing',
      'Reddit bot development',
      'Digital marketing tools',
      'Comment campaign automation',
    ],
    serviceType: 'SaaS Platform',
    areaServed: 'Worldwide',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteData),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationData),
        }}
      />
    </>
  );
}
