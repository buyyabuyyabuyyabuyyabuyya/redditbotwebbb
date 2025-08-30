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

    // Update auto-poster config status
    const { error: statusError } = await supabaseAdmin
      .from('auto_poster_configs')
      .update({
        enabled: false,
        status: 'paused',
        next_post_at: null
      })
      .eq('user_id', userId)
      .eq('product_id', websiteConfigId);

    if (statusError) {
      console.error('Error updating auto-poster status:', statusError);
      // Continue even if status update fails
    }

    // Auto-delete Upstash cron job
    try {
      const cronResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/upstash/setup-cron?configId=${websiteConfigId}`, {
        method: 'DELETE'
      });

      if (!cronResponse.ok) {
        console.error('Failed to delete Upstash cron job');
        // Continue anyway
      }
    } catch (cronError) {
      console.error('Error deleting cron job:', cronError);
      // Continue anyway
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
