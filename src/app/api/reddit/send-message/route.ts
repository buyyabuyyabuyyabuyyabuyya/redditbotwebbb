import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs'

// This handler now just proxies the request to our Supabase Edge Function
export async function POST(req: Request) {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { recipientUsername, accountId, message } = await req.json()
    if (!recipientUsername || !accountId || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
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
      body: JSON.stringify({ userId, recipientUsername, accountId, message }),
    })

    const data = await edgeResp.json()
    return NextResponse.json(data, { status: edgeResp.status })
  } catch (err) {
    console.error('Proxy error (send-message):', err)
    return NextResponse.json(
      { error: 'Failed to call edge function' },
      { status: 500 }
    )
  }
}
