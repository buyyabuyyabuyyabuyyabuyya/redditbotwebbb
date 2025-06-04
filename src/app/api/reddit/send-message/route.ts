import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import snoowrap from 'snoowrap';

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

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { recipientUsername, accountId, message } = await req.json();

    if (!recipientUsername || !accountId || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get the Reddit account credentials from Supabase
    const { data: account, error: accountError } = await supabase
      .from('reddit_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Reddit account not found' },
        { status: 404 }
      );
    }

    // Check if the user has reached their message limit
    const { data: user } = await supabase
      .from('users')
      .select('subscription_status, message_count')
      .eq('id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check message limits
    if (user.subscription_status === 'free' && user.message_count >= 100) {
      return NextResponse.json(
        {
          error:
            'Message limit reached. Please upgrade to Pro for unlimited messages.',
        },
        { status: 403 }
      );
    }

    // Create a Reddit API client
    const reddit = new snoowrap({
      userAgent: 'Reddit Bot SaaS',
      clientId: account.client_id,
      clientSecret: account.client_secret,
      username: account.username,
      password: account.password,
    });

    // Send the message
    await reddit.composeMessage({
      to: recipientUsername,
      subject: 'Message from Reddit Bot SaaS',
      text: message,
    });

    // Update the user's message count
    await supabase
      .from('users')
      .update({ message_count: user.message_count + 1 })
      .eq('id', userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending Reddit message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
