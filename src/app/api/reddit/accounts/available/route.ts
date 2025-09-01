import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { AccountCooldownManager } from '../../../../../lib/accountCooldownManager';

export async function GET(req: Request) {
  try {
    const internal = req.headers.get('X-Internal-API') === 'true';
    let effectiveUserId: string | null = null;
    
    if (internal) {
      effectiveUserId = req.headers.get('X-User-ID');
    } else {
      const { userId } = auth();
      effectiveUserId = userId;
    }

    if (!effectiveUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    switch (action) {
      case 'list':
        // Get all available Reddit accounts for discussion posting
        const { data: accounts } = await supabaseAdmin
          .from('reddit_accounts')
          .select('*')
          .eq('is_discussion_poster', true)
          .eq('is_validated', true);

        return NextResponse.json({ accounts: accounts || [] });

      default:
        // Fallback to cooldown manager for other actions
        const cooldownManager = new AccountCooldownManager();
        const availableAccounts = await cooldownManager.getAvailableAccounts();
        return NextResponse.json({ accounts: availableAccounts });
    }

  } catch (error) {
    console.error('Available accounts API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, accountId } = body;

    const cooldownManager = new AccountCooldownManager();

    switch (action) {
      case 'markUsed':
        if (!accountId) {
          return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
        }
        
        await cooldownManager.markAccountAsUsed(accountId);
        return NextResponse.json({ success: true, message: 'Account marked as used' });

      case 'resetCooldown':
        if (!accountId) {
          return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
        }
        
        await cooldownManager.resetAccountCooldown(accountId);
        return NextResponse.json({ success: true, message: 'Cooldown reset' });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Available accounts API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
