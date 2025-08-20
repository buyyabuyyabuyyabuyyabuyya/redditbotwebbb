import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { callGeminiForText } from '../../../../utils/geminiTextGeneration';

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
    const { product_id, customer_segments, product_description } = await req.json();
    
    if (!product_id || !customer_segments || !product_description) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`Finding customers for product: ${product_id}`);

    // Generate AI prompt for subreddit identification
    const aiPrompt = `You are an expert at identifying relevant Reddit subreddits for products and services.

Your task is to analyze a product description and customer segments to suggest the most relevant subreddits where potential customers would discuss related topics.

PRODUCT DESCRIPTION:
${product_description}

CUSTOMER SEGMENTS:
${customer_segments.join('\n')}

INSTRUCTIONS:
- Suggest 15-20 highly relevant subreddits
- Focus on subreddits where people actively discuss problems your product solves
- Include both broad and niche subreddits
- Prioritize subreddits with active communities
- Avoid promotional or spam-heavy subreddits
- Consider the customer segments when suggesting subreddits

Format your response as a JSON array of subreddit names (without the r/ prefix):
["subreddit1", "subreddit2", "subreddit3", ...]

Example response format:
["SaaS", "digital_marketing", "growthhacking", "startups", "entrepreneur", "marketing", "smallbusiness", "agency", "productmanagement", "indiehackers", "webmarketing", "ecommerce", "contentmarketing", "socialmedia", "business", "freelance", "consulting", "tech", "software", "tools"]

Return only the JSON array, no additional text:`;

    // Get AI suggestions for relevant subreddits
    const aiResponse = await callGeminiForText(aiPrompt, { userId });
    
    if (!aiResponse || aiResponse.error) {
      throw new Error(aiResponse?.error || 'Failed to generate subreddit suggestions');
    }

    let suggestedSubreddits: string[] = [];
    
    try {
      // Try to parse the AI response as JSON
      const jsonMatch = aiResponse.text.match(/\[.*\]/);
      if (jsonMatch) {
        suggestedSubreddits = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: extract subreddit names from text
        const lines = aiResponse.text.split('\n');
        suggestedSubreddits = lines
          .map(line => line.trim().replace(/^["\-\s]+|["\-\s]+$/g, ''))
          .filter(line => line.length > 0 && !line.includes(':'))
          .slice(0, 20);
      }
    } catch (parseError) {
      console.warn('Failed to parse AI response as JSON, using fallback parsing');
      // Fallback parsing
      const lines = aiResponse.text.split('\n');
      suggestedSubreddits = lines
        .map(line => line.trim().replace(/^["\-\s]+|["\-\s]+$/g, ''))
        .filter(line => line.length > 0 && !line.includes(':'))
        .slice(0, 20);
    }

    // Validate and clean subreddit names
    const validSubreddits = suggestedSubreddits
      .filter(name => name.length > 0 && name.length < 21)
      .map(name => name.toLowerCase().replace(/[^a-z0-9_]/g, ''))
      .filter(name => name.length > 0);

    // Remove duplicates
    const uniqueSubreddits = Array.from(new Set(validSubreddits));

    // Limit to 20 subreddits
    const finalSubreddits = uniqueSubreddits.slice(0, 20);

    console.log(`AI suggested ${finalSubreddits.length} relevant subreddits`);

    // Update the product with customer segments and suggested subreddits
    const supabase = createSupabaseServerClient();
    
    const { error: updateError } = await supabase
      .from('products')
      .update({
        customer_segments: customer_segments,
        is_active: true // Mark as active now that setup is complete
      })
      .eq('id', product_id);

    if (updateError) {
      console.error('Error updating product:', updateError);
      throw new Error('Failed to update product with customer segments');
    }

    const response = {
      success: true,
      suggested_subreddits: finalSubreddits,
      customer_segments: customer_segments,
      message: `Successfully identified ${finalSubreddits.length} relevant subreddits for your product`
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Find customers error:', error);
    
    const response = {
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
    message: 'Find customers service is running',
    timestamp: new Date().toISOString()
  });
} 