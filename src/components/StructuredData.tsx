'use client';

export default function StructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "RedditOutreach",
    "applicationCategory": "BusinessApplication",
    "description": "Automate your Reddit outreach with our powerful bot platform. Send personalized messages, target specific subreddits, and track your results.",
    "operatingSystem": "Web Browser",
    "url": "https://redditoutreach.com",
    "offers": {
      "@type": "Offer",
      "category": "subscription"
    },
    "provider": {
      "@type": "Organization",
      "name": "RedditOutreach Team",
      "url": "https://redditoutreach.com"
    },
    "featureList": [
      "Automated Reddit messaging",
      "Subreddit targeting", 
      "Message personalization",
      "Analytics and tracking",
      "Bulk messaging capabilities",
      "Reddit account management"
    ],
    "screenshot": "https://redditoutreach.com/icon-512x512.png",
    "softwareVersion": "1.0",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "150"
    }
  };

  const websiteData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "RedditOutreach",
    "url": "https://redditoutreach.com",
    "description": "The leading platform for Reddit automation and outreach. Streamline your Reddit marketing with advanced bot capabilities.",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://redditoutreach.com/search?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  };

  const organizationData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "RedditOutreach",
    "url": "https://redditoutreach.com",
    "logo": "https://redditoutreach.com/icon-512x512.png",
    "description": "Leading provider of Reddit automation and outreach solutions for businesses and marketers.",
    "foundingDate": "2024",
    "knowsAbout": [
      "Reddit automation",
      "Social media marketing", 
      "Reddit bot development",
      "Digital marketing tools",
      "Social media outreach"
    ],
    "serviceType": "SaaS Platform",
    "areaServed": "Worldwide"
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
