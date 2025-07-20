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

    // Fetch Reddit account(s) that are not banned
    const { data: accounts, error: accErr } = await supabase
      .from('reddit_accounts')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'banned') // Skip banned accounts
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
    let accountErrors = [];
    
    for (const account of accounts) {
      if (accountId && account.id !== accountId) continue; // if specific account requested
      
      try {
        const reddit = new snoowrap({
          userAgent: 'Reddit Bot SaaS - inbox processor',
          clientId: account.client_id,
          clientSecret: account.client_secret,
          username: account.username,
          password: account.password,
        });

        // Fetch unread messages (max 50 per account)
        let unread;
        try {
          unread = await reddit.getUnreadMessages({ limit: 50 });
        } catch (redditError: any) {
          // Check if this is a banned/suspended account error
          const errorMsg = redditError?.message || String(redditError);
          const isBannedError = errorMsg.includes('USER_REQUIRED') || 
                               errorMsg.includes('SUBREDDIT_REQUIRED') ||
                               errorMsg.includes('403') ||
                               errorMsg.includes('suspended') ||
                               errorMsg.includes('banned');
          
          if (isBannedError) {
            console.log(`Account ${account.username} (ID: ${account.id}) appears to be banned/suspended, marking as banned`);
            
            // Mark account as banned
            await supabase
              .from('reddit_accounts')
              .update({ status: 'banned', banned_at: new Date().toISOString() })
              .eq('id', account.id);
            
            // Log the ban
            await supabase.from('bot_logs').insert({
              user_id: userId,
              action: 'account_banned',
              subreddit: '_system',
              status: 'error',
              error_message: `Reddit account ${account.username} (ID: ${account.id}) marked as banned: ${errorMsg.slice(0, 200)}`,
            });
            
            accountErrors.push({ accountId: account.id, username: account.username, error: 'banned' });
            continue; // Skip this account but continue with others
          }
          
          // If it's not a ban error, log it but don't fail the whole process
          console.error(`Non-ban error for account ${account.username}:`, redditError);
          accountErrors.push({ accountId: account.id, username: account.username, error: errorMsg });
          continue;
        }
        for (const msg of unread) {
          const body = (msg.body || '').trim().toLowerCase();
          const isOptOut = ['stop', 'unsubscribe', 'optout', 'opt out'].some((kw) => body.includes(kw));
          if (isOptOut) {
            const { error: insertErr } = await supabase
              .from('opt_outs')
              .insert({ id: crypto.randomUUID(), user_id: userId, recipient: msg.author.name.toLowerCase() }, { ignoreDuplicates: true });
            if (insertErr) {
              console.error('opt_outs insert error', insertErr);
              // fire-and-forget diagnostic log, ignore failure
              const logRes = await supabase.from('bot_logs').insert({
                user_id: userId,
                action: 'opt_out_insert_error',
                subreddit: '_system',
                status: 'error',
                error_message: insertErr.message?.slice(0, 250) || 'insert error',
              });
              if (logRes.error) {
                console.error('bot_logs insert error', logRes.error);
              }
            } else {
              processed += 1;
              console.log(`Recorded opt-out from ${msg.author.name} via account ${account.username}`);
            }
          }
          try { await msg.markAsRead(); } catch {}
        }
      } catch (accountError) {
        // Log account-specific errors but don't fail the whole process
        console.error(`Error processing account ${account.username}:`, accountError);
        accountErrors.push({ accountId: account.id, username: account.username, error: String(accountError) });
      }
    }


    // Log summary
    if (processed > 0) {
      await supabase.from('bot_logs').insert({
        user_id: userId,
        action: 'processed_opt_outs',
        subreddit: '_system',
        status: 'info',
        message: `Recorded ${processed} opt-outs`,
      });
    }

    // Return success even if some accounts had errors
    const result: any = { processed };
    if (accountErrors.length > 0) {
      result.accountErrors = accountErrors;
      result.message = `Processed ${processed} opt-outs, ${accountErrors.length} accounts had errors`;
    }
    
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('process-inbox error', err);
    
    // Check if this is a general authentication/ban error affecting all accounts
    const errorMsg = err?.message || String(err);
    const isBannedError = errorMsg.includes('USER_REQUIRED') || 
                         errorMsg.includes('SUBREDDIT_REQUIRED') ||
                         errorMsg.includes('403') ||
                         errorMsg.includes('suspended') ||
                         errorMsg.includes('banned');
    
    if (isBannedError) {
      // This might be a general auth issue, but we've already handled individual account bans above
      return NextResponse.json({ error: 'Authentication error - accounts may be banned' }, { status: 403 });
    }
    
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
});
