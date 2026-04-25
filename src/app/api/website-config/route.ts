import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import {
  decodeWebsiteConfigCollections,
  mergeWebsiteConfigCollections,
} from '@/lib/websiteConfigCollections';

const createAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

const normalizeConfigForResponse = (config: any) => {
  const decoded = decodeWebsiteConfigCollections(
    config.business_context_terms || []
  );
  return {
    ...config,
    business_context_terms: decoded.businessContextTerms,
    target_subreddits: decoded.targetSubreddits,
  };
};

export async function GET(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    const supabaseAdmin = createAdmin();
    let query = supabaseAdmin
      .from('website_configs')
      .select('*')
      .eq('user_id', userId);
    if (productId) query = query.eq('product_id', productId);

    const { data: configs, error } = await query.order('created_at', {
      ascending: false,
    });
    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch website configs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      configs: (configs || []).map(normalizeConfigForResponse),
    });
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
      targetSubreddits = [],
      negativeKeywords = [],
      businessContextTerms = [],
      relevanceThreshold = 70,
      autoPostersEnabled = false,
    } = body;

    if (!websiteUrl || !websiteDescription) {
      return NextResponse.json(
        { error: 'Website URL and description are required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdmin();

    if (productId) {
      const { data: existingConfig } = await supabaseAdmin
        .from('website_configs')
        .select('id')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .single();

      if (existingConfig) {
        const { data: updatedConfig, error } = await supabaseAdmin
          .from('website_configs')
          .update({
            website_url: websiteUrl,
            website_description: websiteDescription,
            customer_segments: customerSegments,
            target_keywords: targetKeywords,
            negative_keywords: negativeKeywords,
            business_context_terms: mergeWebsiteConfigCollections(
              businessContextTerms,
              targetSubreddits
            ),
            relevance_threshold: relevanceThreshold,
            auto_poster_enabled: autoPostersEnabled,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingConfig.id)
          .select()
          .single();

        if (error) {
          return NextResponse.json(
            { error: 'Failed to update website config' },
            { status: 500 }
          );
        }

        return NextResponse.json({
          config: normalizeConfigForResponse(updatedConfig),
        });
      }
    }

    const { data: newConfig, error } = await supabaseAdmin
      .from('website_configs')
      .insert({
        user_id: userId,
        product_id: null,
        website_url: websiteUrl,
        website_description: websiteDescription,
        customer_segments: customerSegments,
        target_keywords: targetKeywords,
        negative_keywords: negativeKeywords,
        business_context_terms: mergeWebsiteConfigCollections(
          businessContextTerms,
          targetSubreddits
        ),
        relevance_threshold: relevanceThreshold,
        auto_poster_enabled: autoPostersEnabled,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create website config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ config: normalizeConfigForResponse(newConfig) });
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
      targetSubreddits = [],
      negativeKeywords = [],
      businessContextTerms = [],
      relevanceThreshold = 70,
      autoPostersEnabled = false,
    } = body;

    if (!configId) {
      return NextResponse.json(
        { error: 'Config ID is required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdmin();
    const { data: updatedConfig, error } = await supabaseAdmin
      .from('website_configs')
      .update({
        website_url: websiteUrl,
        website_description: websiteDescription,
        customer_segments: customerSegments,
        target_keywords: targetKeywords,
        negative_keywords: negativeKeywords,
        business_context_terms: mergeWebsiteConfigCollections(
          businessContextTerms,
          targetSubreddits
        ),
        relevance_threshold: relevanceThreshold,
        auto_poster_enabled: autoPostersEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', configId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update website config' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      config: normalizeConfigForResponse(updatedConfig),
    });
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
      return NextResponse.json(
        { error: 'Config ID is required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdmin();

    const { data: ownedConfig } = await supabaseAdmin
      .from('website_configs')
      .select('id')
      .eq('id', configId)
      .eq('user_id', userId)
      .single();

    if (!ownedConfig) {
      return NextResponse.json(
        { error: 'Website configuration not found' },
        { status: 404 }
      );
    }

    const { data: autoPosterConfig } = await supabaseAdmin
      .from('auto_poster_configs')
      .select('id, upstash_schedule_id')
      .eq('user_id', userId)
      .eq('website_config_id', configId)
      .maybeSingle();

    if (autoPosterConfig?.upstash_schedule_id && process.env.QSTASH_TOKEN) {
      try {
        await fetch(
          `https://qstash.upstash.io/v2/schedules/${autoPosterConfig.upstash_schedule_id}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${process.env.QSTASH_TOKEN}` },
          }
        );
      } catch (error) {
        console.error(
          'Failed to delete Upstash schedule during config cleanup:',
          error
        );
      }
    }

    await supabaseAdmin
      .from('auto_poster_configs')
      .delete()
      .eq('website_config_id', configId)
      .eq('user_id', userId);
    await supabaseAdmin
      .from('posted_reddit_discussions')
      .delete()
      .eq('website_config_id', configId);

    const { error } = await supabaseAdmin
      .from('website_configs')
      .delete()
      .eq('id', configId)
      .eq('user_id', userId);
    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete website config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Website config API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
