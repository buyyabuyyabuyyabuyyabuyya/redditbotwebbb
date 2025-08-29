import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';

export async function POST(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Fetch website content
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch website' }, { status: 400 });
    }

    const html = await response.text();
    
    // Extract title and meta description
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descriptionMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    
    const title = titleMatch ? titleMatch[1].trim() : '';
    const metaDescription = descriptionMatch ? descriptionMatch[1].trim() : '';
    
    // Generate website description
    let description = '';
    if (metaDescription) {
      description = metaDescription;
    } else if (title) {
      description = `${title} - A web platform providing services and solutions.`;
    } else {
      description = 'A web platform providing services and solutions to users.';
    }

    // Auto-generate customer segments based on common patterns
    const customerSegments = generateCustomerSegments(html, title, metaDescription);
    
    // Auto-generate target keywords
    const targetKeywords = generateTargetKeywords(html, title, metaDescription);
    
    // Auto-generate negative keywords
    const negativeKeywords = [
      'politics',
      'news',
      'entertainment',
      'sports',
      'celebrity',
      'gossip',
      'memes',
      'gaming'
    ];

    // Auto-generate business context terms
    const businessTerms = generateBusinessTerms(html, title, metaDescription);

    return NextResponse.json({
      success: true,
      description,
      customerSegments,
      targetKeywords,
      negativeKeywords,
      businessTerms
    });

  } catch (error) {
    console.error('Website analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

function generateCustomerSegments(html: string, title: string, description: string): string[] {
  const content = `${title} ${description} ${html}`.toLowerCase();
  const segments: string[] = [];

  // Common business segments
  if (content.includes('business') || content.includes('entrepreneur') || content.includes('startup')) {
    segments.push('entrepreneurs', 'business owners', 'startups');
  }
  
  if (content.includes('marketing') || content.includes('advertis') || content.includes('brand')) {
    segments.push('marketers', 'digital marketers', 'marketing professionals');
  }
  
  if (content.includes('developer') || content.includes('programming') || content.includes('code')) {
    segments.push('developers', 'programmers', 'software engineers');
  }
  
  if (content.includes('freelanc') || content.includes('remote work') || content.includes('gig')) {
    segments.push('freelancers', 'remote workers', 'consultants');
  }
  
  if (content.includes('small business') || content.includes('sme')) {
    segments.push('small business owners');
  }
  
  if (content.includes('ecommerce') || content.includes('online store') || content.includes('retail')) {
    segments.push('ecommerce owners', 'online retailers');
  }

  // Default segments if none found
  if (segments.length === 0) {
    segments.push('business professionals', 'entrepreneurs', 'digital marketers');
  }

  return segments.slice(0, 5); // Limit to 5 segments
}

function generateTargetKeywords(html: string, title: string, description: string): string[] {
  const content = `${title} ${description}`.toLowerCase();
  const keywords: string[] = [];

  // Extract keywords based on common business terms
  const businessKeywords = [
    'automation', 'productivity', 'efficiency', 'software', 'tool', 'platform',
    'solution', 'service', 'management', 'analytics', 'dashboard', 'integration',
    'workflow', 'optimization', 'crm', 'saas', 'api', 'cloud', 'digital',
    'online', 'web', 'mobile', 'app', 'system', 'technology'
  ];

  businessKeywords.forEach(keyword => {
    if (content.includes(keyword)) {
      keywords.push(keyword);
    }
  });

  // Add domain-specific keywords based on content
  if (content.includes('market')) keywords.push('marketing', 'advertising');
  if (content.includes('social')) keywords.push('social media', 'engagement');
  if (content.includes('data')) keywords.push('data analysis', 'reporting');
  if (content.includes('customer')) keywords.push('customer service', 'support');
  if (content.includes('sales')) keywords.push('sales', 'revenue');

  // Default keywords if none found
  if (keywords.length === 0) {
    keywords.push('productivity', 'automation', 'business', 'software', 'tool');
  }

  return Array.from(new Set(keywords)).slice(0, 8); // Remove duplicates and limit to 8
}

function generateBusinessTerms(html: string, title: string, description: string): string[] {
  const content = `${title} ${description}`.toLowerCase();
  const terms: string[] = [];

  const businessTerms = [
    'saas', 'software', 'platform', 'tool', 'service', 'solution',
    'system', 'application', 'dashboard', 'analytics', 'api',
    'integration', 'automation', 'workflow', 'crm', 'erp'
  ];

  businessTerms.forEach(term => {
    if (content.includes(term)) {
      terms.push(term);
    }
  });

  // Default terms if none found
  if (terms.length === 0) {
    terms.push('software', 'platform', 'tool', 'service');
  }

  return Array.from(new Set(terms)).slice(0, 6); // Remove duplicates and limit to 6
}
