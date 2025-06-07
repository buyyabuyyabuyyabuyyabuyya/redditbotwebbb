import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getPlanLimits } from '../../../utils/planLimits';

const createSupabaseServerClient = () => {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
};

// Create a Supabase admin client (service role) for privileged updates like message count resets
const supabaseAdmin = createClient(
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
  const supabase = createSupabaseServerClient();

  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    interface BotRequest {
      action: string;
      accountId: string;
      subreddits: string[];
      messageTemplate: string;
      delayTime?: number;
    }
    const { action, accountId, subreddits, messageTemplate, delayTime = 60 }
      = (await req.json()) as BotRequest;
    // Get user's subscription status and usage data (include potential reset timestamp)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('subscription_status, message_count, message_count_reset_at')
      .eq('user_id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
      return NextResponse.json(
        { error: 'Failed to fetch user data' },
        { status: 500 }
      );
    }

    // --- PLAN LIMIT / MONTHLY RESET LOGIC ---
    const plan = (userData.subscription_status || 'free') as any;
    const limits = getPlanLimits(plan);

    // If user is Pro, ensure monthly reset of message_count
    if (plan === 'pro') {
      const now = new Date();
      const lastReset = userData.message_count_reset_at
        ? new Date(userData.message_count_reset_at)
        : null;
      const needsReset =
        !lastReset ||
        lastReset.getUTCFullYear() !== now.getUTCFullYear() ||
        lastReset.getUTCMonth() !== now.getUTCMonth();

      if (needsReset) {
        await supabaseAdmin
          .from('users')
          .update({
            message_count: 0,
            message_count_reset_at: new Date(
              Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
            ).toISOString(),
          })
          .eq('id', userId);

        userData.message_count = 0;
      }
    }

    // Enforce message limit (if any)
    if (
      limits.maxMessages !== null &&
      userData.message_count >= limits.maxMessages
    ) {
      return NextResponse.json(
        {
          error:
            'Message limit reached for your current plan. Please upgrade to increase your limit.',
        },
        { status: 403 }
      );
    }

    // Get account credentials
    const { data: accountData, error: accountError } = await supabase
      .from('reddit_accounts')
      .select('username, password')
      .eq('id', accountId)
      .single();

    if (accountError) {
      console.error('Error fetching account data:', accountError);
      return NextResponse.json(
        { error: 'Failed to fetch account data' },
        { status: 500 }
      );
    }

    // Start the bot operation
    if (action === 'start') {
      // Call external Worker
      const workerUrl = process.env.PLAYWRIGHT_WORKER_URL!;

      if (!workerUrl) {
        return NextResponse.json(
          { error: 'PLAYWRIGHT_WORKER_URL not set in environment' },
          { status: 500 }
        );
      }

      try {
        const response = await fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: accountData.username,
            password: accountData.password,
            subreddits,
            messageTemplate,
            delayTime,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          console.error('Worker error:', text);
          return NextResponse.json(
            { error: 'Worker call failed', details: text },
            { status: 500 }
          );
        }

        const { messagesSent = 0 } = await response.json() as any;

        // Update message_count accordingly (if Worker returned count)
        if (messagesSent > 0) {
          await supabase
            .from('users')
            .update({ message_count: userData.message_count + messagesSent })
            .eq('user_id', userId);
        }

        return NextResponse.json({ success: true, messagesSent });
      } catch (error) {
        console.error('Error calling worker:', error);
        return NextResponse.json(
          { error: 'Failed to call Playwright worker' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in bot operation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
