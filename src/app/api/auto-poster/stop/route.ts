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

    // Update the config to disable auto-posting
    const { error: updateError } = await supabaseAdmin
      .from('website_configs')
      .update({ 
        auto_poster_enabled: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', websiteConfigId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error disabling auto-poster:', updateError);
      return NextResponse.json({ error: 'Failed to stop auto-poster' }, { status: 500 });
    }

    // Update auto-poster status
    const { error: statusError } = await supabaseAdmin
      .from('auto_poster_status')
      .update({
        is_running: false,
        stopped_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('website_config_id', websiteConfigId);

    if (statusError) {
      console.error('Error updating auto-poster status:', statusError);
      // Continue even if status update fails
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Auto-poster stopped successfully'
    });

  } catch (error) {
    console.error('Error stopping auto-poster:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
