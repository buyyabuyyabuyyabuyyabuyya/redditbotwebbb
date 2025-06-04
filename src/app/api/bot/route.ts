import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { chromium } from 'playwright';
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

    const { action, accountId, subreddits, messageTemplate, delayTime } =
      await req.json();

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
      // Launch browser
      const browser = await chromium.launch();
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        // Login to Reddit
        await page.goto('https://www.reddit.com/login');
        await page.fill('input[name="username"]', accountData.username);
        await page.fill('input[name="password"]', accountData.password);
        await page.click('button[type="submit"]');
        await page.waitForNavigation();

        // Check if login was successful
        const isLoggedIn = await page.evaluate(() => {
          return !document.querySelector('input[name="username"]');
        });

        if (!isLoggedIn) {
          throw new Error('Failed to login to Reddit');
        }

        // Start scanning subreddits
        for (const subreddit of subreddits) {
          await page.goto(`https://www.reddit.com/r/${subreddit}/new`);

          // Find posts to message
          const posts = await page.$$('div[data-testid="post-container"]');

          for (const post of posts) {
            // Check if we've already messaged this user
            const author = await post.$eval(
              'a[data-testid="post_author"]',
              (el) => el.textContent
            );

            const { data: existingMessage } = await supabase
              .from('sent_messages')
              .select('id')
              .eq('user_id', userId)
              .eq('recipient', author)
              .single();

            if (!existingMessage) {
              // Send message
              await post.click({
                button: 'right',
                delay: 100,
              });
              await page.click('button:has-text("Send Message")');
              await page.fill(
                'textarea[placeholder="Message"]',
                messageTemplate
              );
              await page.click('button:has-text("Send")');

              // Log the message to sent_messages
              await supabaseAdmin.from('sent_messages').insert([
                {
                  user_id: userId,
                  account_id: accountId,
                  recipient: author,
                  subreddit,
                  message_template: messageTemplate,
                  sent_at: new Date().toISOString(),
                },
              ]);
              
              // Also log to the bot_logs table as required by the rules
              await supabaseAdmin.from('bot_logs').insert([
                {
                  user_id: userId,
                  account_id: accountId,
                  recipient: author,
                  subreddit,
                  message_template: messageTemplate,
                  action: 'send_message',
                  status: 'success',
                },
              ]);

              // Update message count
              await supabase
                .from('users')
                .update({ message_count: userData.message_count + 1 })
                .eq('user_id', userId);

              // Wait for the specified delay
              await new Promise((resolve) =>
                setTimeout(resolve, delayTime * 1000)
              );
            }
          }
        }

        await browser.close();
        return NextResponse.json({ success: true });
      } catch (error) {
        console.error('Error running bot:', error);
        await browser.close();
        return NextResponse.json(
          { error: 'Failed to run bot' },
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
