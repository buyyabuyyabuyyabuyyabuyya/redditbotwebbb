import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs'
import { createClient } from '@supabase/supabase-js'

// This handler now just proxies the request to our Supabase Edge Function
export async function POST(req: Request) {
  try {
    const internal = req.headers.get('X-Internal-API') === 'true';
    const { userId } = auth();

    // If not an internal call, ensure the user is authenticated
    if (!internal && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    const body = (await req.json()) as {
      userId?: string;
      recipientUsername: string;
      accountId: string;
      message: string;
      subject?: string;
      configId?: string;
    };

    // For client-side calls attach the authenticated user ID
    if (!internal) {
      body.userId = userId!;
    }

    const { recipientUsername, accountId, message, configId } = body;

    // Admin Supabase client for logging
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Fetch subreddit for nicer log (optional)
    let subreddit: string | null = null;
    if (configId) {
      const { data: cfg } = await supabaseAdmin
        .from('scan_configs')
        .select('subreddit')
        .eq('id', configId)
        .maybeSingle();
      subreddit = cfg?.subreddit || null;
    }

    // Log attempt
    await supabaseAdmin.from('bot_logs').insert({
      user_id: body.userId || userId,
      config_id: configId,
      action: 'message_send_attempt',
      status: 'info',
      subreddit,
      recipient: recipientUsername,
    });
    if (!recipientUsername || !accountId || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Use explicit Edge Function URL if provided, otherwise construct it from the main Supabase URL
    const funcUrl =
      process.env.NEXT_PUBLIC_SUPABASE_EDGE_FUNCTION_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(
        '.supabase.co',
        '.functions.supabase.co'
      ) + '/send-message'

    const edgeResp = await fetch(funcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    })

    const text = await edgeResp.text();

    if (edgeResp.ok) {
      await supabaseAdmin.from('bot_logs').insert({
        user_id: body.userId || userId,
        config_id: configId,
        action: 'message_sent',
        status: 'success',
        subreddit,
        recipient: recipientUsername,
      });
    } else {
      await supabaseAdmin.from('bot_logs').insert({
        user_id: body.userId || userId,
        config_id: configId,
        action: 'message_send_error',
        status: 'error',
        subreddit,
        recipient: recipientUsername,
        error_message: text.slice(0, 250),
      });
    }

    // Echo the edge-function status for logging
    console.log('Edge send-message response', edgeResp.status, text);
    return new NextResponse(text, { status: edgeResp.status, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Proxy error (send-message):', err);
    try {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      );
      await supabaseAdmin.from('bot_logs').insert({
        user_id: userId,
        action: 'message_send_error',
        status: 'error',
        error_message: err instanceof Error ? err.message : String(err),
      });
    } catch (_) {}

    return NextResponse.json(
      { error: 'Failed to call edge function' },
      { status: 500 }
    )
  }
}
