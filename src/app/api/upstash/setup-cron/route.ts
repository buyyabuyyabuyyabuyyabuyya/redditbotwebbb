import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

// Setup Upstash QStash cron job for auto-posting
export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { productId, accountId, intervalMinutes } = await req.json();

    if (!productId || !accountId || !intervalMinutes) {
      return NextResponse.json({ 
        error: 'Missing required fields: productId, accountId, intervalMinutes' 
      }, { status: 400 });
    }

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
    const { data: config } = await supabaseAdmin
      .from('auto_poster_configs')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .eq('account_id', accountId)
      .single();

    if (!config) {
      return NextResponse.json({ error: 'Auto-poster config not found' }, { status: 404 });
    }

    // Create Upstash QStash schedule
    const scheduleUrl = 'https://qstash.upstash.io/v2/schedules';
    const targetUrl = `https://redditoutreach.com/api/cron/auto-poster?secret=${process.env.CRON_SECRET}`;
    
    // Convert minutes to cron expression
    const cronExpression = intervalMinutes >= 60 
      ? `0 */${Math.floor(intervalMinutes / 60)} * * *` // Every X hours
      : `*/${intervalMinutes} * * * *`; // Every X minutes

    const scheduleResponse = await fetch(scheduleUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${qstashToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        destination: targetUrl,
        cron: cronExpression,
        body: JSON.stringify({
          productId,
          configId: config.id,
          source: 'upstash'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      })
    });

    if (!scheduleResponse.ok) {
      const error = await scheduleResponse.text();
      console.error('Upstash schedule creation failed:', error);
      return NextResponse.json({ 
        error: 'Failed to create Upstash schedule',
        details: error 
      }, { status: 500 });
    }

    const scheduleData = await scheduleResponse.json();

    // Store the Upstash schedule ID in our config
    await supabaseAdmin
      .from('auto_poster_configs')
      .update({
        upstash_schedule_id: scheduleData.scheduleId,
        status: 'active'
      })
      .eq('id', config.id);

    return NextResponse.json({
      success: true,
      message: 'Upstash cron job created successfully',
      scheduleId: scheduleData.scheduleId,
      cronExpression,
      targetUrl
    });

  } catch (error) {
    console.error('Upstash setup error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
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
