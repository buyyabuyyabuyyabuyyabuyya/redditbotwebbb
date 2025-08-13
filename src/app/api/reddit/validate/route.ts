import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import snoowrap from 'snoowrap';
import { createServerSupabaseClient } from '../../../../utils/supabase-server';
// Note: Proxy validation will be added here when server routes are implemented.

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

    try {
      // Temporarily disable any global proxy envs so validation is unaffected
      const prevHttp = process.env.HTTP_PROXY;
      const prevHttps = process.env.HTTPS_PROXY;
      const prevNoProxy = process.env.NO_PROXY;
      try {
        delete process.env.HTTP_PROXY;
        delete process.env.HTTPS_PROXY;

        // Create a Reddit API client
        const reddit: snoowrap = new snoowrap({
          userAgent: 'Reddit Bot SaaS',
          clientId,
          clientSecret,
          username,
          password,
        });

        // Perform a simple API call to validate
        const me = await (reddit as any).getMe();
        const name = me?.name || 'unknown';
        return NextResponse.json({ success: true, username: name });
      } finally {
        process.env.HTTP_PROXY = prevHttp;
        process.env.HTTPS_PROXY = prevHttps;
        if (prevNoProxy !== undefined) process.env.NO_PROXY = prevNoProxy; else delete process.env.NO_PROXY;
      }
    } catch (redditError) {
      const rawMsg = redditError instanceof Error ? redditError.message : String(redditError);
      // Detect proxy/tunnel/network errors explicitly to avoid misreporting as invalid credentials
      const tunnelErr = /tunneling socket could not be established|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(rawMsg);
      if (tunnelErr) {
        return NextResponse.json({ error: 'Network/proxy error while contacting Reddit. Please retry.' }, { status: 502 });
      }

      // Extract more specific auth error if possible
      let errorMessage = 'Invalid Reddit credentials';
      if (rawMsg.includes('401')) {
        errorMessage = 'Reddit authentication failed: Invalid username/password or client ID/secret';
      } else if (rawMsg.includes('403')) {
        errorMessage = 'Reddit authentication failed: Account may be locked or requires additional verification';
      }

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
  } catch (error) {
    console.error('Error validating Reddit credentials:', error);
    return NextResponse.json(
      { error: 'Invalid Reddit credentials' },
      { status: 400 }
    );
  }
}
