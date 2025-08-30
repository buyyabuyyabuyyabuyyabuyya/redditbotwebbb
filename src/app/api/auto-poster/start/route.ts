import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { websiteConfigId } = await request.json();

    if (!websiteConfigId) {
      return NextResponse.json({ error: 'Website config ID is required' }, { status: 400 });
    }

    // Verify the website config exists and belongs to the user
    const { data: config, error: configError } = await supabaseAdmin
      .from('website_configs')
      .select('*')
      .eq('id', websiteConfigId)
      .eq('user_id', userId)
      .single();

    if (configError || !config) {
      return NextResponse.json({ error: 'Website config not found' }, { status: 404 });
    }

    // Update the config to enable auto-posting
    const { error: updateError } = await supabaseAdmin
      .from('website_configs')
      .update({ 
        auto_poster_enabled: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', websiteConfigId);

    if (updateError) {
      console.error('Error enabling auto-poster:', updateError);
      return NextResponse.json({ error: 'Failed to start auto-poster' }, { status: 500 });
    }

    // Create or update auto-poster status
    const { error: statusError } = await supabaseAdmin
      .from('auto_poster_status')
      .upsert({
        user_id: userId,
        website_config_id: websiteConfigId,
        is_running: true,
        started_at: new Date().toISOString(),
        posts_today: 0,
        last_post_result: null
      }, {
        onConflict: 'user_id,website_config_id'
      });

    if (statusError) {
      console.error('Error updating auto-poster status:', statusError);
      // Continue even if status update fails
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Auto-poster started successfully',
      config: config
    });

  } catch (error) {
    console.error('Error starting auto-poster:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
