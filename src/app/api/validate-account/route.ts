import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import snoowrap from 'snoowrap';
import { createServerSupabaseClient } from '../../../utils/supabase-server';
import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase Admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Using the imported createServerSupabaseClient function



export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { username, password, clientId, clientSecret } = await req.json();

    if (!username || !password || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Real Reddit account validation using snoowrap
    let isValid = false;
    try {
      // Clear any existing proxy environment variables for validation
      const prevHttp = process.env.HTTP_PROXY;
      const prevHttps = process.env.HTTPS_PROXY;
      const prevNoProxy = process.env.NO_PROXY;
      
      try {
        // Ensure no proxy is used during validation
        delete process.env.HTTP_PROXY;
        delete process.env.HTTPS_PROXY;
        delete process.env.http_proxy;
        delete process.env.https_proxy;
        delete process.env.ALL_PROXY;
        delete process.env.all_proxy;
        process.env.NO_PROXY = '*';
        process.env.no_proxy = '*';
        
        const reddit = new snoowrap({
          userAgent: 'Reddit Bot SaaS',
          clientId,
          clientSecret,
          username,
          password,
        });
        // @ts-ignore
        await reddit.getMe();
        isValid = true;
      } finally {
        // Restore original proxy environment variables
        process.env.HTTP_PROXY = prevHttp;
        process.env.HTTPS_PROXY = prevHttps;
        if (prevNoProxy !== undefined) process.env.NO_PROXY = prevNoProxy; else delete process.env.NO_PROXY;
      }
    } catch (err) {
      isValid = false;
    }

    // Store the account in Supabase using admin client to bypass RLS
    const { error } = await supabaseAdmin.from('reddit_accounts').insert([
      {
        user_id: userId,
        username,
        client_id: clientId,
        client_secret: clientSecret,
        password,
        is_validated: isValid,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error('Error storing account:', error);
      return NextResponse.json(
        { error: 'Failed to store account' },
        { status: 500 }
      );
    }

    return NextResponse.json({ isValid });
  } catch (error) {
    console.error('Error validating account:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
