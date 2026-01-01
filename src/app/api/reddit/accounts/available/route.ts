import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { formatToPacificTime } from '../../../../../lib/timeUtils';

export async function GET(req: Request) {
  try {
    // Check for internal API header (for cron jobs and system calls)
    const internalApiHeader = req.headers.get('X-Internal-API');
    const isInternalCall = internalApiHeader === 'true';

    // Parse URL parameters
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'list';
    const accountId = url.searchParams.get('accountId');

    console.log(`🔍 [REDDIT_ACCOUNTS] [${formatToPacificTime(new Date())}] API called with action: ${action}, accountId: ${accountId}, internal: ${isInternalCall}`);

    let userId: string | null = null;

    if (isInternalCall) {
      // For internal calls, we don't need user authentication
      // We'll fetch all admin accounts with is_discussion_poster=true
      console.log('[REDDIT_ACCOUNTS] Internal API call detected, bypassing user auth');
    } else {
      // For regular user calls, require authentication
      const authResult = auth();
      userId = authResult.userId;

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    if (!isInternalCall && userId) {
      // Check if user is admin
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('is_admin')
        .eq('user_id', userId)
        .single();

      if (!userData?.is_admin) {
        console.log(`⛔ [REDDIT_ACCOUNTS] User ${userId} is not an admin, denying access`);
        return NextResponse.json({ error: 'Forbidden: Admin access only' }, { status: 403 });
      }
    }

    // Handle different actions
    switch (action) {
      case 'cooldown-info':
        if (!accountId) {
          return NextResponse.json({ error: 'Account ID required for cooldown-info' }, { status: 400 });
        }

        console.log(`📊 [REDDIT_ACCOUNTS] Getting cooldown info for account: ${accountId}`);

        const { data: account } = await supabaseAdmin
          .from('reddit_accounts')
          .select('id, username, last_used_at, cooldown_minutes, is_available')
          .eq('id', accountId)
          .eq('is_discussion_poster', true)
          .eq('is_validated', true)
          .single();

        if (!account) {
          return NextResponse.json({
            cooldownInfo: {
              accountId,
              isOnCooldown: false,
              error: 'Account not found'
            }
          });
        }

        const now = new Date();
        let isOnCooldown = false;
        let cooldownEndsAt: string | undefined;
        let minutesRemaining: number | undefined;

        if (account.last_used_at && !account.is_available) {
          const lastUsed = new Date(account.last_used_at);
          const cooldownMinutes = account.cooldown_minutes || 30;
          const cooldownExpiry = new Date(lastUsed.getTime() + cooldownMinutes * 60 * 1000);

          if (now < cooldownExpiry) {
            isOnCooldown = true;
            cooldownEndsAt = cooldownExpiry.toISOString();
            minutesRemaining = Math.ceil((cooldownExpiry.getTime() - now.getTime()) / (1000 * 60));
          }
        }

        console.log(`📊 [REDDIT_ACCOUNTS] Cooldown info for ${account.username}:`, {
          isOnCooldown,
          minutesRemaining,
          lastUsedAt: account.last_used_at
        });

        return NextResponse.json({
          cooldownInfo: {
            accountId,
            isOnCooldown,
            cooldownEndsAt,
            minutesRemaining,
            lastUsedAt: account.last_used_at,
            username: account.username
          }
        });

      case 'check':
        if (!accountId) {
          return NextResponse.json({ error: 'Account ID required for availability check' }, { status: 400 });
        }

        console.log(`✅ [REDDIT_ACCOUNTS] Checking availability for account: ${accountId}`);

        const { data: checkAccount } = await supabaseAdmin
          .from('reddit_accounts')
          .select('id, username, last_used_at, cooldown_minutes, is_available')
          .eq('id', accountId)
          .eq('is_discussion_poster', true)
          .eq('is_validated', true)
          .single();

        if (!checkAccount) {
          return NextResponse.json({ available: false, reason: 'Account not found' });
        }

        let available = checkAccount.is_available;
        let reason = '';

        if (!available && checkAccount.last_used_at) {
          const lastUsed = new Date(checkAccount.last_used_at);
          const cooldownMinutes = checkAccount.cooldown_minutes || 30;
          const cooldownExpiry = new Date(lastUsed.getTime() + cooldownMinutes * 60 * 1000);
          const now = new Date();

          if (now >= cooldownExpiry) {
            available = true;
            reason = 'Cooldown expired, account should be available';
          } else {
            reason = `On cooldown for ${Math.ceil((cooldownExpiry.getTime() - now.getTime()) / (1000 * 60))} more minutes`;
          }
        }

        console.log(`✅ [REDDIT_ACCOUNTS] [${formatToPacificTime(new Date())}] Account ${checkAccount.username} availability: ${available} (${reason})`);

        return NextResponse.json({
          available,
          reason,
          username: checkAccount.username
        });

      case 'list':
      default:
        console.log('📋 [REDDIT_ACCOUNTS] Listing all available accounts');

        // Get all admin-controlled Reddit accounts for discussion posting
        // Only accounts with is_discussion_poster=true (set by admin) are returned
        const { data: accounts } = await supabaseAdmin
          .from('reddit_accounts')
          .select(`
            id, username, is_validated, is_discussion_poster, status, is_available, 
            total_posts_made, last_used_at, cooldown_minutes, proxy_enabled,
            proxy_host, proxy_port, proxy_type, user_agent_enabled, user_agent_type,
            client_id, client_secret, password
          `)
          .eq('is_discussion_poster', true)
          .eq('is_validated', true);

        console.log(`📋 [REDDIT_ACCOUNTS] Found ${accounts?.length || 0} discussion poster accounts`);

        return NextResponse.json({ accounts: accounts || [] });
    }

  } catch (error) {
    console.error('❌ [REDDIT_ACCOUNTS] API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Users cannot modify Reddit accounts - only admin controls which accounts are used
    return NextResponse.json({ error: 'Account management is admin-only' }, { status: 403 });

  } catch (error) {
    console.error('Available accounts API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
