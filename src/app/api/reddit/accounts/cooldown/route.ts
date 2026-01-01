import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { formatToPacificTime } from '../../../../../lib/timeUtils';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const accountId = searchParams.get('accountId');

    if (action === 'check' && accountId) {
      // Check if specific account is available
      const { data: account } = await supabaseAdmin
        .from('reddit_accounts')
        .select('id, last_used_at, cooldown_minutes, is_available, current_cooldown_until')
        .eq('id', accountId)
        .eq('is_discussion_poster', true)
        .eq('is_validated', true)
        .single();

      if (!account) {
        return NextResponse.json({ available: false, reason: 'Account not found' });
      }

      const now = new Date();

      // Use current_cooldown_until if available, otherwise calculate from last_used_at
      let cooldownEnd: Date;
      if (account.current_cooldown_until) {
        cooldownEnd = new Date(account.current_cooldown_until);
      } else if (account.last_used_at) {
        const lastUsed = new Date(account.last_used_at);
        const cooldownMinutes = account.cooldown_minutes || 30;
        cooldownEnd = new Date(lastUsed.getTime() + cooldownMinutes * 60 * 1000);
      } else {
        return NextResponse.json({ available: account.is_available });
      }

      const isAvailable = now >= cooldownEnd && account.is_available;

      return NextResponse.json({
        available: isAvailable,
        cooldownEndsAt: cooldownEnd.toISOString(),
        minutesRemaining: Math.max(0, Math.ceil((cooldownEnd.getTime() - now.getTime()) / (60 * 1000)))
      });
    }

    if (action === 'list') {
      // Get all available accounts
      const { data: accounts } = await supabaseAdmin
        .from('reddit_accounts')
        .select('id, username, is_validated, is_discussion_poster, last_used_at, cooldown_minutes, is_available, total_posts_made, current_cooldown_until')
        .eq('is_discussion_poster', true)
        .eq('is_validated', true);

      const now = new Date();
      const availableAccounts = [];
      const onCooldownAccounts = [];

      for (const account of accounts || []) {
        // Use current_cooldown_until if available, otherwise calculate from last_used_at
        let cooldownEnd: Date | null = null;
        if (account.current_cooldown_until) {
          cooldownEnd = new Date(account.current_cooldown_until);
        } else if (account.last_used_at) {
          const lastUsed = new Date(account.last_used_at);
          const cooldownMinutes = account.cooldown_minutes || 30;
          cooldownEnd = new Date(lastUsed.getTime() + cooldownMinutes * 60 * 1000);
        }

        if (cooldownEnd) {
          const isAvailable = now >= cooldownEnd && account.is_available;

          if (isAvailable) {
            availableAccounts.push(account);
          } else {
            onCooldownAccounts.push({
              ...account,
              cooldownEndsAt: cooldownEnd.toISOString(),
              minutesRemaining: Math.max(0, Math.ceil((cooldownEnd.getTime() - now.getTime()) / (60 * 1000)))
            });
          }
        } else if (account.is_available) {
          availableAccounts.push(account);
        }
      }

      return NextResponse.json({
        accounts: availableAccounts,
        available: availableAccounts,
        onCooldown: onCooldownAccounts
      });
    }

    if (action === 'status') {
      // Get status of all accounts
      const { data: accounts } = await supabaseAdmin
        .from('reddit_accounts')
        .select('id, username, is_validated, is_discussion_poster, last_used_at, cooldown_minutes, is_available, total_posts_made, current_cooldown_until')
        .eq('is_discussion_poster', true)
        .eq('is_validated', true);

      const now = new Date();
      const availableAccounts = [];
      const onCooldownAccounts = [];

      for (const account of accounts || []) {
        // Use current_cooldown_until if available, otherwise calculate from last_used_at
        let cooldownEnd: Date | null = null;
        if (account.current_cooldown_until) {
          cooldownEnd = new Date(account.current_cooldown_until);
        } else if (account.last_used_at) {
          const lastUsed = new Date(account.last_used_at);
          const cooldownMinutes = account.cooldown_minutes || 30;
          cooldownEnd = new Date(lastUsed.getTime() + cooldownMinutes * 60 * 1000);
        }

        if (cooldownEnd) {
          const isAvailable = now >= cooldownEnd && account.is_available;

          if (isAvailable) {
            availableAccounts.push({
              ...account,
              cooldownEndsAt: null,
              minutesRemaining: 0
            });
          } else {
            onCooldownAccounts.push({
              ...account,
              cooldownEndsAt: cooldownEnd.toISOString(),
              minutesRemaining: Math.max(0, Math.ceil((cooldownEnd.getTime() - now.getTime()) / (60 * 1000)))
            });
          }
        } else if (account.is_available) {
          availableAccounts.push({
            ...account,
            cooldownEndsAt: null,
            minutesRemaining: 0
          });
        }
      }

      return NextResponse.json({
        available: availableAccounts,
        onCooldown: onCooldownAccounts
      });
    }

    return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 });

  } catch (error) {
    console.error('Cooldown API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'cleanup') {
      console.log(`🧹 [COOLDOWN_API] [${formatToPacificTime(new Date())}] Running auto-cleanup for expired cooldowns`);

      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('reddit_accounts')
        .update({
          is_available: true,
          current_cooldown_until: null
        })
        .eq('is_available', false)
        .lte('current_cooldown_until', now);

      if (error) {
        console.error('Error during cooldown cleanup:', error);
        return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Expired cooldowns cleared' });
    }

    // Parse body for regular cooldown updates
    let body;
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }

    const { accountId, cooldownMinutes } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
    }

    const cooldownTime = cooldownMinutes || 30;
    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + cooldownTime * 60 * 1000);

    // First get current total_posts_made count
    const { data: currentAccount } = await supabaseAdmin
      .from('reddit_accounts')
      .select('total_posts_made')
      .eq('id', accountId)
      .single();

    // Mark account as used and set cooldown
    const { error } = await supabaseAdmin
      .from('reddit_accounts')
      .update({
        last_used_at: now.toISOString(),
        cooldown_minutes: cooldownTime,
        current_cooldown_until: cooldownUntil.toISOString(),
        is_available: false,
        total_posts_made: (currentAccount?.total_posts_made || 0) + 1
      })
      .eq('id', accountId);

    if (error) {
      console.error('Error marking account as used:', error);
      return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
    }

    // Schedule account to become available again
    const availableAt = new Date(now.getTime() + cooldownTime * 60 * 1000);

    return NextResponse.json({
      success: true,
      accountId,
      cooldownMinutes: cooldownTime,
      availableAt: availableAt.toISOString(),
      availableAtPT: formatToPacificTime(availableAt)
    });

  } catch (error) {
    console.error('Cooldown POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { accountId } = await req.json();

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
    }

    // Reset account cooldown
    const { error } = await supabaseAdmin
      .from('reddit_accounts')
      .update({
        is_available: true,
        last_used_at: null,
        current_cooldown_until: null
      })
      .eq('id', accountId);

    if (error) {
      console.error('Error resetting account cooldown:', error);
      return NextResponse.json({ error: 'Failed to reset cooldown' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      accountId
    });

  } catch (error) {
    console.error('Cooldown DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
