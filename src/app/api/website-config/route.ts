import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    let query = supabaseAdmin
      .from('website_configs')
      .select('*')
      .eq('user_id', userId);

    if (productId) {
      query = query.eq('product_id', productId);
    }

    const { data: configs, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching website configs:', error);
      return NextResponse.json({ error: 'Failed to fetch website configs' }, { status: 500 });
    }

    return NextResponse.json({ configs: configs || [] });

  } catch (error) {
    console.error('Website config API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      productId,
      websiteUrl,
      websiteDescription,
      customerSegments = [],
      targetKeywords = [],
      negativeKeywords = [],
      businessContextTerms = [],
      relevanceThreshold = 70,
      autoPostersEnabled = false
    } = body;

    if (!websiteUrl || !websiteDescription) {
      return NextResponse.json({ 
        error: 'Website URL and description are required' 
      }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Check if config already exists for this product
    if (productId) {
      const { data: existingConfig } = await supabaseAdmin
        .from('website_configs')
        .select('id')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .single();

      if (existingConfig) {
        // Update existing config
        const { data: updatedConfig, error } = await supabaseAdmin
          .from('website_configs')
          .update({
            website_url: websiteUrl,
            website_description: websiteDescription,
            customer_segments: customerSegments,
            target_keywords: targetKeywords,
            negative_keywords: negativeKeywords,
            business_context_terms: businessContextTerms,
            relevance_threshold: relevanceThreshold,
            auto_poster_enabled: autoPostersEnabled,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingConfig.id)
          .select()
          .single();

        if (error) {
          console.error('Error updating website config:', error);
          return NextResponse.json({ error: 'Failed to update website config' }, { status: 500 });
        }

        return NextResponse.json({ config: updatedConfig });
      }
    }

    // Create new config
    const { data: newConfig, error } = await supabaseAdmin
      .from('website_configs')
      .insert({
        user_id: userId,
        product_id: productId,
        website_url: websiteUrl,
        website_description: websiteDescription,
        customer_segments: customerSegments,
        target_keywords: targetKeywords,
        negative_keywords: negativeKeywords,
        business_context_terms: businessContextTerms,
        relevance_threshold: relevanceThreshold,
        auto_poster_enabled: autoPostersEnabled
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating website config:', error);
      return NextResponse.json({ error: 'Failed to create website config' }, { status: 500 });
    }

    return NextResponse.json({ config: newConfig });

  } catch (error) {
    console.error('Website config API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      configId,
      websiteUrl,
      websiteDescription,
      customerSegments = [],
      targetKeywords = [],
      negativeKeywords = [],
      businessContextTerms = [],
      relevanceThreshold = 70,
      autoPostersEnabled = false
    } = body;

    if (!configId) {
      return NextResponse.json({ error: 'Config ID is required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { data: updatedConfig, error } = await supabaseAdmin
      .from('website_configs')
      .update({
        website_url: websiteUrl,
        website_description: websiteDescription,
        customer_segments: customerSegments,
        target_keywords: targetKeywords,
        negative_keywords: negativeKeywords,
        business_context_terms: businessContextTerms,
        relevance_threshold: relevanceThreshold,
        auto_poster_enabled: autoPostersEnabled,
        updated_at: new Date().toISOString()
      })
      .eq('id', configId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating website config:', error);
      return NextResponse.json({ error: 'Failed to update website config' }, { status: 500 });
    }

    return NextResponse.json({ config: updatedConfig });

  } catch (error) {
    console.error('Website config API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const configId = searchParams.get('configId');

    if (!configId) {
      return NextResponse.json({ error: 'Config ID is required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { error } = await supabaseAdmin
      .from('website_configs')
      .delete()
      .eq('id', configId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting website config:', error);
      return NextResponse.json({ error: 'Failed to delete website config' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Website config API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
