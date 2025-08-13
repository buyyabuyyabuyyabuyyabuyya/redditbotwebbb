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

    // Fetch Reddit account(s) that are not banned or have credential errors
    const { data: accounts, error: accErr } = await supabase
      .from('reddit_accounts')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'banned') // Skip banned accounts
      .neq('status', 'credential_error') // Skip accounts with credential errors (permanently)
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
        const prevHttp = process.env.HTTP_PROXY;
        const prevHttps = process.env.HTTPS_PROXY;
        const prevNoProxy = process.env.NO_PROXY;
        try {
          if (account.proxy_enabled && account.proxy_host && account.proxy_port && account.proxy_type) {
            const auth = account.proxy_username
              ? `${encodeURIComponent(account.proxy_username)}${account.proxy_password ? ':' + encodeURIComponent(account.proxy_password) : ''}@`
              : '';
            const proxyUrl = `${account.proxy_type}://${auth}${account.proxy_host}:${account.proxy_port}`;
            process.env.HTTP_PROXY = proxyUrl;
            process.env.HTTPS_PROXY = proxyUrl;
            if (process.env.NO_PROXY !== undefined) delete process.env.NO_PROXY;
            console.log('process-inbox: proxy_enabled', `${account.proxy_type}://${account.proxy_host}:${account.proxy_port}`);
            await supabase.from('bot_logs').insert({
              user_id: userId,
              action: 'proxy_enabled_for_request',
              status: 'info',
              subreddit: '_system',
              message: `${account.proxy_type}://${account.proxy_host}:${account.proxy_port}`,
            });
          } else {
            // Aggressively clear ALL proxy environment variables
            delete process.env.HTTP_PROXY;
            delete process.env.HTTPS_PROXY;
            delete process.env.http_proxy;
            delete process.env.https_proxy;
            delete process.env.ALL_PROXY;
            delete process.env.all_proxy;
            process.env.NO_PROXY = '*';
            process.env.no_proxy = '*';
            console.log('process-inbox: proxy_disabled');
          }

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
          
          // Check if this is a 401 Unauthorized error (password changed, incorrect credentials)
          const isCredentialError = errorMsg.includes('401') || 
                                   errorMsg.includes('Unauthorized') ||
                                   errorMsg.includes('invalid_grant') ||
                                   errorMsg.includes('authentication failed');
          
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
          
          if (isCredentialError) {
            console.log(`Account ${account.username} (ID: ${account.id}) has incorrect credentials (401 Unauthorized), marking as credential_error`);
            
            // Mark account as having credential error
            await supabase
              .from('reddit_accounts')
              .update({ 
                status: 'credential_error', 
                credential_error_at: new Date().toISOString() 
              })
              .eq('id', account.id);
            
            // Log the credential error
            await supabase.from('bot_logs').insert({
              user_id: userId,
              action: 'account_credential_error',
              subreddit: '_system',
              status: 'error',
              error_message: `Reddit account ${account.username} (ID: ${account.id}) has incorrect credentials: ${errorMsg.slice(0, 200)}`,
            });
            
            accountErrors.push({ accountId: account.id, username: account.username, error: 'credential_error' });
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
              .insert({ id: crypto.randomUUID(), user_id: userId, recipient: msg.author.name.toLowerCase() });
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
          try {
            await (msg as any).markAsRead();
          } catch (_e) {
            // ignore markAsRead failures
          }
        }
        } finally {
          process.env.HTTP_PROXY = prevHttp;
          process.env.HTTPS_PROXY = prevHttps;
          if (prevNoProxy !== undefined) process.env.NO_PROXY = prevNoProxy; else delete process.env.NO_PROXY;
          console.log('process-inbox: proxy_envs_restored');
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
