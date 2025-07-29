import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/settings/',
          '/messages/',
          '/file-logs/',
          '/admin/',
        ],
      },
      {
        userAgent: 'GPTBot',
        allow: [
          '/',
          '/pricing',
          '/tutorial',
          '/privacy',
          '/terms',
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/settings/',
          '/messages/',
          '/file-logs/',
          '/admin/',
        ],
      },
      {
        userAgent: 'ChatGPT-User',
        allow: [
          '/',
          '/pricing',
          '/tutorial',
          '/privacy',
          '/terms',
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/settings/',
          '/messages/',
          '/file-logs/',
          '/admin/',
        ],
      },
      {
        userAgent: 'CCBot',
        allow: [
          '/',
          '/pricing',
          '/tutorial',
          '/privacy',
          '/terms',
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/settings/',
          '/messages/',
          '/file-logs/',
          '/admin/',
        ],
      },
      {
        userAgent: 'anthropic-ai',
        allow: [
          '/',
          '/pricing',
          '/tutorial',
          '/privacy',
          '/terms',
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/settings/',
          '/messages/',
          '/file-logs/',
          '/admin/',
        ],
      },
      {
        userAgent: 'Claude-Web',
        allow: [
          '/',
          '/pricing',
          '/tutorial',
          '/privacy',
          '/terms',
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/settings/',
          '/messages/',
          '/file-logs/',
          '/admin/',
        ],
      }
    ],
    sitemap: 'https://redditoutreach.com/sitemap.xml',
  }
}
