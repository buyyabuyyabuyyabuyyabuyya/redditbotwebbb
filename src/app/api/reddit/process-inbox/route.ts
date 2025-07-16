import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { createClient } from '@supabase/supabase-js';
import snoowrap from 'snoowrap';

export const runtime = 'nodejs'; // uses snoowrap

// Health check
export async function GET() {
  return NextResponse.json({ ok: true });
}

interface Payload {
  userId: string;
  accountId?: string; // optional; if omitted, process all accounts for user
}

// POST handler, protected by QStash signature so only internal jobs can invoke it
export const POST = verifySignatureAppRouter(async (req: Request) => {
  try {
    const { accountId, userId } = (await req.json()) as Payload;
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Fetch Reddit account(s)
    const { data: accounts, error: accErr } = await supabase
      .from('reddit_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at');
    if (accErr) {
      console.error('process-inbox supabase error', accErr);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!accounts || accounts.length === 0) {
      // Nothing to process – treat as success so QStash doesn't retry
      return NextResponse.json({ processed: 0 });
    }

    let processed = 0;
    for (const account of accounts) {
      if (accountId && account.id !== accountId) continue; // if specific account requested
      const reddit = new snoowrap({
        userAgent: 'Reddit Bot SaaS - inbox processor',
        clientId: account.client_id,
        clientSecret: account.client_secret,
        username: account.username,
        password: account.password,
      });

      // Fetch unread messages (max 50 per account)
      const unread = await reddit.getUnreadMessages({ limit: 50 });
      for (const msg of unread) {
        const body = (msg.body || '').trim().toLowerCase();
        const isOptOut = ['stop', 'unsubscribe', 'optout', 'opt out'].some((kw) => body.includes(kw));
        if (isOptOut) {
          await supabase
            .from('opt_outs')
            .insert({ user_id: userId, recipient: msg.author.name.toLowerCase() }, { onConflict: 'user_id,recipient' })
            .select();
          processed += 1;
          console.log(`Recorded opt-out from ${msg.author.name}`);
        }
        try { await msg.markAsRead(); } catch {}
      }
    }


    // Log summary
    if (processed > 0) {
      await supabase.from('bot_logs').insert({
        user_id: userId,
        action: 'processed_opt_outs',
        status: 'info',
        message: `Recorded ${processed} opt-outs`,
      });
    }

    return NextResponse.json({ processed });
  } catch (err) {
    console.error('process-inbox error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
});
