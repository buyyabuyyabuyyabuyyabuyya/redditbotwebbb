import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { AccountCooldownManager } from '../../../../../lib/accountCooldownManager';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cooldownManager = new AccountCooldownManager();

    // Get next available admin-controlled Reddit account for discussion posting
    const account = await cooldownManager.getNextAvailableAccount();
    
    if (!account) {
      const waitTime = await cooldownManager.getEstimatedWaitTime();
      return NextResponse.json({ 
        error: 'No discussion poster accounts available',
        estimatedWaitMinutes: waitTime
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      accountId: account.id,
      username: account.username
    });

  } catch (error) {
    console.error('Error fetching discussion poster account:', error);
    return NextResponse.json({ 
      error: 'Server error' 
    }, { status: 500 });
  }
}
