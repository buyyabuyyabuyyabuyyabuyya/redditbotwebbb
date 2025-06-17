import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs'

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
    };

    // For client-side calls attach the authenticated user ID
    if (!internal) {
      body.userId = userId!;
    }

    const { recipientUsername, accountId, message } = body;
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
    // Echo the edge-function status for logging
    console.log('Edge send-message response', edgeResp.status, text);
    return new NextResponse(text, { status: edgeResp.status, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Proxy error (send-message):', err)
    return NextResponse.json(
      { error: 'Failed to call edge function' },
      { status: 500 }
    )
  }
}
