import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import snoowrap from 'snoowrap';
import { generateUserAgent, parseUserAgent, validateUserAgent } from '../../../../utils/userAgents';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userAgent, accountId } = body;

    let testUserAgent = userAgent;

    // If accountId is provided, get User Agent from database
    if (accountId) {
      const { data: account, error } = await supabaseAdmin
        .from('reddit_accounts')
        .select('user_agent_enabled, user_agent_type, user_agent_custom, client_id, client_secret, username, password')
        .eq('id', accountId)
        .eq('user_id', userId)
        .single();

      if (error || !account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      if (account.user_agent_enabled) {
        testUserAgent = generateUserAgent({
          enabled: account.user_agent_enabled,
          type: account.user_agent_type || 'default',
          custom: account.user_agent_custom || undefined
        });
      } else {
        testUserAgent = 'Reddit Bot SaaS'; // Default
      }

      // Test with actual Reddit API if we have account credentials
      if (account.client_id && account.client_secret && account.username && account.password) {
        try {
          const reddit = new snoowrap({
            userAgent: testUserAgent,
            clientId: account.client_id,
            clientSecret: account.client_secret,
            username: account.username,
            password: account.password,
          });

          // Try to get user info to test the User Agent
          // Use .then() directly to avoid TypeScript circular reference issues with snoowrap's thenable objects
          await new Promise<void>((resolve, reject) => {
            reddit.getMe().then(() => {
              console.log(`User Agent test successful`);
              resolve();
            }).catch(reject);
          });

          // Update last checked timestamp
          await supabaseAdmin
            .from('reddit_accounts')
            .update({ user_agent_last_checked: new Date().toISOString() })
            .eq('id', accountId);

          const parsed = parseUserAgent(testUserAgent);
          return NextResponse.json({
            success: true,
            userAgent: testUserAgent,
            browser: `${parsed.browser} (${parsed.os})`,
            device: parsed.device,
            tested: true
          });
        } catch (error: any) {
          return NextResponse.json({
            error: `Reddit API test failed: ${error.message}`,
            userAgent: testUserAgent
          }, { status: 400 });
        }
      }
    }

    // If no accountId or credentials, just validate the User Agent string
    if (!testUserAgent) {
      return NextResponse.json({ error: 'No User Agent provided' }, { status: 400 });
    }

    // Validate User Agent format
    const validation = validateUserAgent(testUserAgent);
    if (!validation.isValid) {
      return NextResponse.json({
        error: `Invalid User Agent: ${validation.issues.join(', ')}`,
        userAgent: testUserAgent
      }, { status: 400 });
    }

    // Parse User Agent for information
    const parsed = parseUserAgent(testUserAgent);

    return NextResponse.json({
      success: true,
      userAgent: testUserAgent,
      browser: `${parsed.browser} (${parsed.os})`,
      device: parsed.device,
      tested: false
    });

  } catch (error) {
    console.error('User Agent test error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}