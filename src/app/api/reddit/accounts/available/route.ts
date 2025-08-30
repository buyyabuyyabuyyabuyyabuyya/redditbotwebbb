import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { AccountCooldownManager } from '../../../../../lib/accountCooldownManager';

export async function GET(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    const cooldownManager = new AccountCooldownManager();

    switch (action) {
      case 'next':
        // Get the next available account
        const nextAccount = await cooldownManager.getNextAvailableAccount();
        if (!nextAccount) {
          const waitTime = await cooldownManager.getEstimatedWaitTime();
          return NextResponse.json({ 
            error: 'No accounts available',
            estimatedWaitMinutes: waitTime
          }, { status: 404 });
        }
        return NextResponse.json({ account: nextAccount });

      case 'status':
        // Get status of all accounts
        const status = await cooldownManager.getAllAccountsStatus();
        return NextResponse.json(status);

      case 'cleanup':
        // Clean up expired cooldowns
        await cooldownManager.cleanupExpiredCooldowns();
        return NextResponse.json({ success: true, message: 'Cleanup completed' });

      default:
        // Get all available accounts
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
