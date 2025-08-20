import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { callGeminiForText } from '../../../../utils/geminiTextGeneration';
import { 
  GenerateDescriptionRequest, 
  GenerateDescriptionResponse,
  ScrapedWebsiteData 
} from '../../../../types/beno-one';

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
    const { scraped_content, product_name }: GenerateDescriptionRequest = await req.json();
    
    if (!scraped_content) {
      return NextResponse.json(
        { success: false, error: 'Scraped content is required' },
        { status: 400 }
      );
    }

    console.log(`Generating AI description for product: ${product_name || 'Unknown'}`);

    // Prepare content for AI analysis
    const contentForAI = prepareContentForAI(scraped_content, product_name);

    // Generate AI description using Gemini
    const aiPrompt = `You are an expert at creating natural, user-friendly product descriptions for websites. 

Your task is to analyze the provided website content and create a clear, engaging description that explains what the product/service does.

IMPORTANT GUIDELINES:
- Write in natural, conversational language
- Focus on what the product/service does and who it helps
- Avoid promotional or salesy language
- Keep it clear and easy to understand
- Make it searchable (include relevant keywords naturally)
- Target length: 2-4 sentences
- Write as if explaining to a friend

Website Content:
${contentForAI}

Create a natural, helpful description:`;

    const aiResponse = await callGeminiForText(aiPrompt, { userId });
    
    if (!aiResponse || aiResponse.error) {
      throw new Error(aiResponse.error || 'Failed to generate AI description');
    }

    const generatedDescription = aiResponse.text?.trim();

    if (!generatedDescription) {
      throw new Error('AI generated empty description');
    }

    console.log(`Successfully generated AI description: ${generatedDescription.substring(0, 100)}...`);

    const response: GenerateDescriptionResponse = {
      success: true,
      description: generatedDescription
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('AI description generation error:', error);
    
    const response: GenerateDescriptionResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };

    return NextResponse.json(response, { status: 500 });
  }
}

// Helper function to prepare content for AI analysis
function prepareContentForAI(scrapedContent: ScrapedWebsiteData, productName?: string): string {
  let content = '';
  
  // Add product name if available
  if (productName) {
    content += `Product/Service Name: ${productName}\n\n`;
  }
  
  // Add page title
  if (scrapedContent.title) {
    content += `Page Title: ${scrapedContent.title}\n\n`;
  }
  
  // Add meta description
  if (scrapedContent.meta_description) {
    content += `Meta Description: ${scrapedContent.meta_description}\n\n`;
  }
  
  // Add main headings (most important content)
  if (scrapedContent.headings && scrapedContent.headings.length > 0) {
    content += `Main Headings:\n${scrapedContent.headings.slice(0, 5).join('\n')}\n\n`;
  }
  
  // Add main content (first 1000 characters to avoid token limits)
  if (scrapedContent.main_content) {
    const truncatedContent = scrapedContent.main_content.substring(0, 1000);
    content += `Main Content: ${truncatedContent}${scrapedContent.main_content.length > 1000 ? '...' : ''}\n\n`;
  }
  
  // Add detected technologies
  if (scrapedContent.technologies && scrapedContent.technologies.length > 0) {
    content += `Technologies Used: ${scrapedContent.technologies.join(', ')}\n\n`;
  }
  
  // Add social media presence
  if (scrapedContent.social_media) {
    const socialLinks = Object.entries(scrapedContent.social_media)
      .filter(([_, link]) => link)
      .map(([platform, _]) => platform)
      .join(', ');
    
    if (socialLinks) {
      content += `Social Media: ${socialLinks}\n\n`;
    }
  }
  
  return content.trim();
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'AI description generation service is running',
    timestamp: new Date().toISOString()
  });
} 