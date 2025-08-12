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
      // Create a Reddit API client
      // The bufferutil and utf-8-validate warnings are optional dependencies and can be ignored
      const reddit: snoowrap = new snoowrap({
        userAgent: 'Reddit Bot SaaS',
        clientId,
        clientSecret,
        username,
        password,
      });

      // Test the credentials by making a simple API call
      // Use a separate function call to get the user info to avoid TypeScript circular reference issues
      // Create a promise to get user info
      const userInfoPromise = reddit.getMe().then((me: any) => {
        return { name: me?.name || 'unknown' };
      });

      const userInfo = await userInfoPromise;
      console.log(
        'Reddit account validation successful for user:',
        userInfo.name
      );

      // If we get here, the credentials are valid
      return NextResponse.json({ success: true, username: userInfo.name });
    } catch (redditError) {
      console.error('Error validating with Reddit API:', redditError);

      // Extract more specific error message if possible
      let errorMessage = 'Invalid Reddit credentials';
      if (redditError instanceof Error) {
        if (redditError.message.includes('401')) {
          errorMessage =
            'Reddit authentication failed: Invalid username/password or client ID/secret';
        } else if (redditError.message.includes('403')) {
          errorMessage =
            'Reddit authentication failed: Account may be locked or requires additional verification';
        }
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
