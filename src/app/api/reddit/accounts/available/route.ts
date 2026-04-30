import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { formatToPacificTime } from '../../../../../lib/timeUtils';

type PoolStatus = 'healthy' | 'limited' | 'offline';

const createAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

const getCooldownMinutesRemaining = (account: {
  last_used_at?: string | null;
  cooldown_minutes?: number | null;
}) => {
  if (!account.last_used_at) return null;

  const lastUsed = new Date(account.last_used_at);
  const cooldownMinutes = account.cooldown_minutes || 30;
  const cooldownExpiry = new Date(
    lastUsed.getTime() + cooldownMinutes * 60 * 1000
  );
  const now = new Date();

  if (now >= cooldownExpiry) return 0;
  return Math.ceil((cooldownExpiry.getTime() - now.getTime()) / (1000 * 60));
};

const getPoolStatus = async (
  supabaseAdmin: ReturnType<typeof createAdmin>
) => {
  const { data: accounts, error } = await supabaseAdmin
    .from('reddit_accounts')
    .select('id, is_available, last_used_at, cooldown_minutes')
    .eq('is_discussion_poster', true)
    .eq('is_validated', true);

  if (error) {
    throw new Error(error.message);
  }

  const availableCount =
    accounts?.filter((account) => account.is_available === true).length || 0;

  const cooldownWaits =
    accounts
      ?.filter((account) => !account.is_available)
      .map(getCooldownMinutesRemaining)
      .filter((minutes): minutes is number => minutes !== null && minutes > 0)
      .sort((a, b) => a - b) || [];

  let status: PoolStatus = 'offline';
  if (availableCount > 1) status = 'healthy';
  else if (availableCount === 1 || cooldownWaits.length > 0) status = 'limited';

  return {
    status,
    availableCount,
    nextAvailableIn: cooldownWaits[0] ?? 0,
  };
};

export async function GET(req: Request) {
  try {
    const internalApiHeader = req.headers.get('X-Internal-API');
    const isInternalCall = internalApiHeader === 'true';
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'status';
    const accountId = url.searchParams.get('accountId');

    console.log(
      `🔍 [REDDIT_ACCOUNTS] [${formatToPacificTime(new Date())}] action=${action}, internal=${isInternalCall}`
    );

    if (!isInternalCall) {
      const authResult = auth();
      if (!authResult.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const supabaseAdmin = createAdmin();

    // AUTO-CLEANUP: Before doing anything, reset any accounts whose cooldown has expired
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from('reddit_accounts')
      .update({
        is_available: true,
        current_cooldown_until: null
      })
      .eq('is_available', false)
      .lte('current_cooldown_until', nowIso);

    if (!isInternalCall) {
      const poolStatus = await getPoolStatus(supabaseAdmin);
      return NextResponse.json(poolStatus);
    }

    switch (action) {
      case 'cooldown-info': {
        if (!accountId) {
          return NextResponse.json(
            { error: 'Account ID required for cooldown-info' },
            { status: 400 }
          );
        }

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
              error: 'Account not found',
            },
          });
        }

        const minutesRemaining = getCooldownMinutesRemaining(account);
        const isOnCooldown = !!minutesRemaining && minutesRemaining > 0;
        const cooldownEndsAt = isOnCooldown
          ? new Date(
              new Date(account.last_used_at!).getTime() +
                (account.cooldown_minutes || 30) * 60 * 1000
            ).toISOString()
          : undefined;

        return NextResponse.json({
          cooldownInfo: {
            accountId,
            isOnCooldown,
            cooldownEndsAt,
            minutesRemaining: minutesRemaining || undefined,
            lastUsedAt: account.last_used_at,
            username: account.username,
          },
        });
      }

      case 'check': {
        if (!accountId) {
          return NextResponse.json(
            { error: 'Account ID required for availability check' },
            { status: 400 }
          );
        }

        const { data: account } = await supabaseAdmin
          .from('reddit_accounts')
          .select('id, username, last_used_at, cooldown_minutes, is_available')
          .eq('id', accountId)
          .eq('is_discussion_poster', true)
          .eq('is_validated', true)
          .single();

        if (!account) {
          return NextResponse.json({ available: false, reason: 'Account not found' });
        }

        const minutesRemaining = getCooldownMinutesRemaining(account);
        const cooldownExpired = minutesRemaining === 0;
        const available = account.is_available || cooldownExpired;
        const reason = available
          ? cooldownExpired
            ? 'Cooldown expired, account should be available'
            : ''
          : `On cooldown for ${minutesRemaining || 0} more minutes`;

        return NextResponse.json({
          available,
          reason,
          username: account.username,
        });
      }

      case 'status': {
        const { data: accounts } = await supabaseAdmin
          .from('reddit_accounts')
          .select(
            'id, username, is_validated, is_discussion_poster, is_available, last_used_at, cooldown_minutes'
          )
          .eq('is_discussion_poster', true)
          .eq('is_validated', true);

        const available = (accounts || []).filter(
          (account) => account.is_available
        );
        const onCooldown = (accounts || [])
          .filter((account) => !account.is_available)
          .map((account) => {
            const minutesRemaining = getCooldownMinutesRemaining(account) || 0;
            return {
              ...account,
              cooldownEndsAt: account.last_used_at
                ? new Date(
                    new Date(account.last_used_at).getTime() +
                      (account.cooldown_minutes || 30) * 60 * 1000
                  ).toISOString()
                : '',
              minutesRemaining,
            };
          });

        return NextResponse.json({ available, onCooldown });
      }

      case 'list':
      default: {
        const { data: accounts } = await supabaseAdmin
          .from('reddit_accounts')
          .select(
            `id, username, is_validated, is_discussion_poster, status, is_available,
            total_posts_made, last_used_at, cooldown_minutes, proxy_enabled,
            proxy_host, proxy_port, proxy_type, proxy_username, proxy_password,
            user_agent_enabled, user_agent_type, user_agent_custom,
            client_id, client_secret, password`
          )
          .eq('is_discussion_poster', true)
          .eq('is_validated', true)
          .eq('is_available', true)
          .order('last_used_at', { ascending: true, nullsFirst: true });

        return NextResponse.json({ accounts: accounts || [] });
      }
    }
  } catch (error) {
    console.error('❌ [REDDIT_ACCOUNTS] API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'Account management is admin-only' },
    { status: 403 }
  );
}
