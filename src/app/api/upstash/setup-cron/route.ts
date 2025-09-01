import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

// Setup Upstash QStash cron job for auto-posting
export async function POST(req: Request) {
  try {
    const internal = req.headers.get('X-Internal-API') === 'true';
    console.log('[UPSTASH] Starting cron job setup...');

    const userIdFromHeader = req.headers.get('X-User-ID');
    
    let effectiveUserId: string | null = null;
    
    console.log('[UPSTASH] Checking auth - internal:', internal, 'userIdFromHeader:', !!userIdFromHeader);
    
    if (internal && userIdFromHeader) {
      effectiveUserId = userIdFromHeader;
    } else {
      const { userId } = auth();
      effectiveUserId = userId;
    }
    
    console.log('[UPSTASH] Effective user ID:', !!effectiveUserId);
    
    if (!effectiveUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[UPSTASH] Request body:', await req.json());
    
    const { productId, accountId, intervalMinutes } = await req.json();

    if (!productId || !accountId || !intervalMinutes) {
      return NextResponse.json({ 
        error: 'Missing required fields: productId, accountId, intervalMinutes' 
      }, { status: 400 });
    }

    console.log('[UPSTASH] Validating QStash token...');
    
    // Use admin's QStash token from environment
    const qstashToken = process.env.QSTASH_TOKEN;
    if (!qstashToken) {
      return NextResponse.json({ 
        error: 'QStash token not configured on server' 
      }, { status: 500 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Get the config to check if it exists
    console.log('[UPSTASH] Looking for config with:', { userId: effectiveUserId, productId, accountId });
    const { data: config, error: configError } = await supabaseAdmin
      .from('auto_poster_configs')
      .select('id')
      .eq('user_id', effectiveUserId)
      .eq('product_id', productId)
      .eq('account_id', accountId)
      .single();

    if (configError) {
      console.error('[UPSTASH] Config query error:', configError);
      return NextResponse.json({ error: 'Database error finding config' }, { status: 500 });
    }

    if (!config) {
      console.error('[UPSTASH] Auto-poster config not found');
      return NextResponse.json({ error: 'Auto-poster config not found' }, { status: 404 });
    }
    console.log('[UPSTASH] Found config:', config.id);

    // Create Upstash QStash schedule
    const scheduleUrl = 'https://qstash.upstash.io/v2/schedules';
    const targetUrl = `https://redditoutreach.com/api/cron/auto-poster`;
    
    console.log('[UPSTASH] Target URL:', targetUrl);
    console.log('[UPSTASH] Schedule URL:', scheduleUrl);
    
    // Convert minutes to cron expression
    const cronExpression = intervalMinutes >= 60 
      ? `0 */${Math.floor(intervalMinutes / 60)} * * *` // Every X hours
      : `*/${intervalMinutes} * * * *`; // Every X minutes
    
    console.log('[UPSTASH] Cron expression:', cronExpression);

    const requestBody = {
      destination: targetUrl,
      cron: cronExpression,
      body: JSON.stringify({
        productId,
        configId: config.id,
        source: 'upstash'
      }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_SECRET}`
      }
    };
    
    console.log('[UPSTASH] Request body:', JSON.stringify(requestBody, null, 2));
    
    const scheduleResponse = await fetch(scheduleUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${qstashToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('[UPSTASH] Schedule response status:', scheduleResponse.status);

    if (!scheduleResponse.ok) {
      const error = await scheduleResponse.text();
      console.error('[UPSTASH] Schedule creation failed with status:', scheduleResponse.status);
      console.error('[UPSTASH] Error response:', error);
      console.error('[UPSTASH] Request headers sent:', {
        'Authorization': `Bearer ${qstashToken.substring(0, 10)}...`,
        'Content-Type': 'application/json'
      });
      return NextResponse.json({ 
        error: 'Failed to create Upstash schedule',
        details: error,
        status: scheduleResponse.status,
        targetUrl: targetUrl
      }, { status: 500 });
    }

    const scheduleData = await scheduleResponse.json();
    console.log('[UPSTASH] Schedule created successfully:', scheduleData);

    // Store the Upstash schedule ID in our config
    const updateResult = await supabaseAdmin
      .from('auto_poster_configs')
      .update({
        upstash_schedule_id: scheduleData.scheduleId,
        status: 'active'
      })
      .eq('id', config.id);
    
    if (updateResult.error) {
      console.error('[UPSTASH] Failed to update config with schedule ID:', updateResult.error);
    } else {
      console.log('[UPSTASH] Updated config with schedule ID:', scheduleData.scheduleId);
    }

    return NextResponse.json({
      success: true,
      message: 'Upstash cron job created successfully',
      scheduleId: scheduleData.scheduleId,
      cronExpression,
      targetUrl
    });

  } catch (error) {
    console.error('[UPSTASH] Cron setup error:', error);
    console.error('[UPSTASH] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ 
      error: 'Server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// Delete Upstash schedule
export async function DELETE(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const configId = searchParams.get('configId');

    if (!configId) {
      return NextResponse.json({ error: 'Missing configId' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Get config with Upstash details
    const { data: config } = await supabaseAdmin
      .from('auto_poster_configs')
      .select('upstash_schedule_id')
      .eq('id', configId)
      .eq('user_id', userId)
      .single();

    // Use admin's QStash token
    const qstashToken = process.env.QSTASH_TOKEN;

    if (!config || !config.upstash_schedule_id) {
      return NextResponse.json({ error: 'No Upstash schedule found' }, { status: 404 });
    }

    // Delete from Upstash
    const deleteResponse = await fetch(`https://qstash.upstash.io/v2/schedules/${config.upstash_schedule_id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${qstashToken}`,
      }
    });

    if (!deleteResponse.ok) {
      console.error('Failed to delete Upstash schedule:', await deleteResponse.text());
    }

    // Clear from our database
    await supabaseAdmin
      .from('auto_poster_configs')
      .update({
        upstash_schedule_id: null,
        status: 'paused'
      })
      .eq('id', configId);

    return NextResponse.json({
      success: true,
      message: 'Upstash schedule deleted successfully'
    });

  } catch (error) {
    console.error('Upstash delete error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
