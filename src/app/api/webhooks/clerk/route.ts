import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createClient } from '@supabase/supabase-js';

// Supabase admin client – bypasses RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(req: Request) {
  try {
    const payload = await req.text();

    // Verify Clerk signature
    const evt = new Webhook(process.env.CLERK_WEBHOOK_SECRET!).verify(payload, {
      'svix-id': headers().get('svix-id')!,
      'svix-timestamp': headers().get('svix-timestamp')!,
      'svix-signature': headers().get('svix-signature')!,
    }) as any;

    const { id: user_id, email_addresses = [] } = evt.data ?? {};
    const email: string | undefined = email_addresses[0]?.email_address?.toLowerCase();

    if (user_id && email) {
      await supabase.from('clerk_emails').upsert({ user_id, email });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Clerk webhook error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 400 });
  }
}