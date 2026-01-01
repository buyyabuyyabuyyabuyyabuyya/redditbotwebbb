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

    const body = await request.text();
    console.log('[STOP] Raw request body:', body);

    let websiteConfigId;
    if (body.trim()) {
      try {
        const parsed = JSON.parse(body);
        websiteConfigId = parsed.websiteConfigId;
      } catch (parseError) {
        console.error('[STOP] JSON parse error:', parseError);
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
      }
    } else {
      console.error('[STOP] Empty request body');
      return NextResponse.json({ error: 'Request body is empty' }, { status: 400 });
    }

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
      .or(`website_config_id.eq.${websiteConfigId},product_id.eq.${websiteConfigId}`);

    if (statusError) {
      console.error('Error updating auto-poster status:', statusError);
      // Continue even if status update fails
    }

    // Get the Upstash schedule ID to delete
    const { data: configData } = await supabaseAdmin
      .from('auto_poster_configs')
      .select('upstash_schedule_id')
      .eq('user_id', userId)
      .or(`website_config_id.eq.${websiteConfigId},product_id.eq.${websiteConfigId}`)
      .single();

    // Auto-delete Upstash cron job
    if (configData?.upstash_schedule_id) {
      try {
        const deleteUrl = `https://qstash.upstash.io/v2/schedules/${configData.upstash_schedule_id}`;
        const cronResponse = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`
          }
        });

        if (cronResponse.ok) {
          console.log('[STOP] Successfully deleted Upstash schedule:', configData.upstash_schedule_id);
        } else {
          console.error('[STOP] Failed to delete Upstash schedule:', await cronResponse.text());
        }
      } catch (cronError) {
        console.error('[STOP] Error deleting Upstash schedule:', cronError);
      }
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
