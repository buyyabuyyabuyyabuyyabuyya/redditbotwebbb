import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';

const PB_BASE = 'https://app.beno.one/pbsb/api';

export async function GET(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Get campaigns from Beno promoting_products
    const promotingRes = await fetch(`${PB_BASE}/collections/beno_promoting_products/records?sort=-created&perPage=50`);
    
    if (!promotingRes.ok) {
      throw new Error('Failed to fetch promoting products');
    }

    const promotingData = await promotingRes.json();
    const campaigns = [];

    // For each promoting product, get comment stats
    for (const product of promotingData.items || []) {
      // Get comment count from auto_posting_logs
      const { data: commentLogs, count } = await supabaseAdmin
        .from('auto_posting_logs')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .eq('product_id', product.id)
        .eq('status', 'posted');

      // Get last comment date
      const { data: lastComment } = await supabaseAdmin
        .from('auto_posting_logs')
        .select('posted_at')
        .eq('user_id', userId)
        .eq('product_id', product.id)
        .eq('status', 'posted')
        .order('posted_at', { ascending: false })
        .limit(1)
        .single();

      campaigns.push({
        id: product.id,
        name: product.name,
        url: product.url,
        description: product.description,
        created_at: product.created,
        status: product.validation_status || 'active',
        total_comments: count || 0,
        last_comment_at: lastComment?.posted_at || null
      });
    }

    return NextResponse.json({
      success: true,
      campaigns
    });

  } catch (error) {
    console.error('Discussion campaigns error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
