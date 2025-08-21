import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { chromium } from 'playwright';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ScrapedWebsiteData, ScrapeWebsiteRequest, ScrapeWebsiteResponse } from '../../../../types/beno-one';

const createSupabaseServerClient = () => {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
};

export async function POST(req: Request) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const { url }: ScrapeWebsiteRequest = await req.json();
    
    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    console.log(`Starting website scraping for: ${url}`);

    // Launch browser and scrape website
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      // Set user agent to avoid detection
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      // Set viewport
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      // Navigate to URL with timeout
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Wait for content to load
      await page.waitForTimeout(2000);

      // Try to wait for dynamic content
      try {
        await page.waitForFunction(() => {
          return document.body && document.body.textContent && document.body.textContent.length > 100;
        }, { timeout: 10000 });
      } catch (e) {
        console.log('Dynamic content wait timeout, proceeding with available content');
      }

      // Extract website data
      const scrapedData: ScrapedWebsiteData = await page.evaluate(() => {
        // Get basic page info
        const title = document.title || '';
        const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
        const metaKeywords = document.querySelector('meta[name="keywords"]')?.getAttribute('content')?.split(',').map(k => k.trim()) || [];
        
        // Get main content (focus on article, main, or body content)
        let mainContent = '';
        const contentSelectors = [
          'article',
          'main',
          '[role="main"]',
          '.content',
          '.main-content',
          '.post-content',
          '.entry-content',
          '.product-description',
          '.product-info',
          '.hero-content',
          '.landing-content'
        ];
        
        for (const selector of contentSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent && element.textContent.trim().length > 50) {
            mainContent = element.textContent.trim();
            break;
          }
        }
        
        // Fallback to body if no main content found
        if (!mainContent || mainContent.length < 50) {
          mainContent = document.body?.textContent?.trim() || '';
        }
        
        // Clean up content (remove extra whitespace, scripts, etc.)
        mainContent = mainContent
          .replace(/\s+/g, ' ')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .trim();
        
        // Get headings
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
          .map(h => h.textContent?.trim())
          .filter(Boolean) as string[];
        
        // Get links
        const links = Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.getAttribute('href'))
          .filter(href => href && href.startsWith('http')) as string[];
        
        // Get images
        const images = Array.from(document.querySelectorAll('img[src]'))
          .map(img => img.getAttribute('src'))
          .filter(src => src && src.startsWith('http')) as string[];
        
        // Get social media links
        const socialMedia = {
          twitter: '',
          facebook: '',
          linkedin: '',
          instagram: '',
          youtube: ''
        };
        
        const socialSelectors = {
          twitter: 'a[href*="twitter.com"], a[href*="x.com"]',
          facebook: 'a[href*="facebook.com"]',
          linkedin: 'a[href*="linkedin.com"]',
          instagram: 'a[href*="instagram.com"]',
          youtube: 'a[href*="youtube.com"], a[href*="youtu.be"]'
        };
        
        Object.entries(socialSelectors).forEach(([platform, selector]) => {
          const element = document.querySelector(selector);
          if (element) {
            socialMedia[platform as keyof typeof socialMedia] = element.getAttribute('href') || '';
          }
        });
        
        // Detect technologies (enhanced detection)
        const technologies: string[] = [];
        const htmlContent = document.documentElement.innerHTML.toLowerCase();
        const techIndicators = {
          'React': ['react', 'jsx', 'createelement'],
          'Vue': ['vue', 'v-bind', 'v-if'],
          'Angular': ['angular', 'ng-', 'ngapp'],
          'WordPress': ['wordpress', 'wp-', 'wp_'],
          'Shopify': ['shopify', 'liquid', 'shopify.theme'],
          'WooCommerce': ['woocommerce', 'wc-'],
          'Magento': ['magento', 'mage.'],
          'Drupal': ['drupal', 'drupal-'],
          'Joomla': ['joomla', 'joomla-'],
          'Next.js': ['next', 'nextjs', '__next'],
          'Nuxt.js': ['nuxt', 'nuxtjs'],
          'Gatsby': ['gatsby', 'gatsby-'],
          'Tailwind': ['tailwind', 'tw-'],
          'Bootstrap': ['bootstrap', 'bs-'],
          'jQuery': ['jquery', 'jq-'],
          'Node.js': ['node', 'express'],
          'PHP': ['php', '<?php'],
          'Python': ['python', 'django', 'flask'],
          'Ruby': ['ruby', 'rails', 'erb']
        };
        
        Object.entries(techIndicators).forEach(([name, indicators]) => {
          if (indicators.some(indicator => htmlContent.includes(indicator))) {
            technologies.push(name);
          }
        });
        
        // Get structured data (JSON-LD)
        let structuredData = null;
        try {
          const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
          if (jsonLdScript && jsonLdScript.textContent) {
            structuredData = JSON.parse(jsonLdScript.textContent);
          }
        } catch (e) {
          // Ignore JSON parsing errors
        }
        
        return {
          title,
          meta_description: metaDescription,
          meta_keywords: metaKeywords,
          main_content: mainContent.substring(0, 8000), // Increased content length
          headings,
          links: links.slice(0, 30), // Increased to 30 links
          images: images.slice(0, 15), // Increased to 15 images
          social_media: socialMedia,
          technologies,
          structured_data: structuredData,
          scraped_at: new Date().toISOString()
        };
      });

      // Clean and validate scraped data
      if (!scrapedData.title && !scrapedData.main_content) {
        throw new Error('Could not extract meaningful content from website');
      }

      // Store scraped data in database
      const supabase = createSupabaseServerClient();
      
      // Create a temporary product entry to store the scraped data
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          user_id: userId,
          name: scrapedData.title || 'Untitled Product',
          url: url,
          scraped_content: scrapedData,
          is_active: false // Mark as inactive until user confirms
        })
        .select()
        .single();

      if (productError) {
        console.error('Error storing scraped data:', productError);
        throw new Error('Failed to store scraped data');
      }

      console.log(`Successfully scraped website: ${url}`);
      console.log(`Product ID created: ${product.id}`);

      const response: ScrapeWebsiteResponse = {
        success: true,
        data: scrapedData
      };

      return NextResponse.json(response);

    } finally {
      await browser.close();
    }

  } catch (error) {
    console.error('Website scraping error:', error);
    
    const response: ScrapeWebsiteResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };

    return NextResponse.json(response, { status: 500 });
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'Website scraping service is running',
    timestamp: new Date().toISOString()
  });
} 