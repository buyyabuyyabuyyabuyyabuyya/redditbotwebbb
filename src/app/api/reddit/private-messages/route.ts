import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';
import Snoowrap from 'snoowrap';

// Initialize Supabase client with admin privileges
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

// GET endpoint to fetch Reddit private messages
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the account ID from the URL parameters
    const accountId = request.nextUrl.searchParams.get('accountId');
    
    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    // Verify that the account belongs to the user
    const { data: account, error: accountError } = await supabaseAdmin
      .from('reddit_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
    
    // Use the Reddit API to fetch actual messages
    try {
      // Create a Reddit API client with the account credentials
      const userAgent = `web:reddit-bot-saas:v1.0.0 (by /u/${account.username})`;
      
      const reddit = new Snoowrap({
        userAgent,
        clientId: account.client_id,
        clientSecret: account.client_secret,
        username: account.username,
        password: account.password
      });
      
      console.log(`Fetching messages for Reddit account: ${account.username}`);
      
      // Get limit parameter from query string or use default (100 is typically the Reddit API max)
      const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100');
      console.log(`Fetching up to ${limit} messages for each category (inbox & sent)`);
      
      // Fetch both inbox and sent messages with increased limit
      // Use type assertion since the Snoowrap type definitions might be incomplete
      const inbox = await reddit.getInbox({ limit } as any);
      const sent = await reddit.getSentMessages({ limit } as any);
      
      // Process and combine the messages
      const inboxMessages = inbox.map((msg: any) => ({
        id: msg.id,
        subject: msg.subject || 'No Subject',
        body: msg.body,
        author: msg.author?.name || 'Unknown',
        created_utc: msg.created_utc,
        isIncoming: true,
        wasRead: !msg.new
      }));
      
      const sentMessages = sent.map((msg: any) => ({
        id: msg.id,
        subject: msg.subject || 'No Subject',
        body: msg.body,
        author: msg.dest || 'Unknown',
        created_utc: msg.created_utc,
        isIncoming: false,
        wasRead: true
      }));
      
      // Combine and sort by creation time (newest first)
      const allMessages = [...inboxMessages, ...sentMessages]
        .sort((a, b) => b.created_utc - a.created_utc);
      
      return NextResponse.json({ messages: allMessages });
    } catch (redditError) {
      console.error('Error fetching Reddit messages:', redditError);
      return NextResponse.json({ 
        error: 'Failed to fetch messages from Reddit', 
        details: redditError instanceof Error ? redditError.message : 'Unknown error' 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST endpoint to send a message reply
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId, messageId, body } = await request.json();
    
    if (!accountId || !messageId || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify that the account belongs to the user
    const { data: account, error: accountError } = await supabaseAdmin
      .from('reddit_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    try {
      // Use the Reddit API to actually send the reply
      try {
        // Create a Reddit API client with the account credentials
        const userAgent = `web:reddit-bot-saas:v1.0.0 (by /u/${account.username})`;
        
        const reddit = new Snoowrap({
          userAgent,
          clientId: account.client_id,
          clientSecret: account.client_secret,
          username: account.username,
          password: account.password
        });
        
        console.log(`Sending reply to message ${messageId} from account ${account.username}`);
        
        // Get the message and then reply to it
        const message = await reddit.getMessage(messageId);
        await message.reply(body);
        
        // Update user's message count
        const { data: userData, error: userError } = await supabaseAdmin
          .from('users')
          .select('message_count')
          .eq('id', userId)
          .single();
        
        if (!userError && userData) {
          await supabaseAdmin
            .from('users')
            .update({ message_count: (userData.message_count || 0) + 1 })
            .eq('id', userId);
        }
        
        return NextResponse.json({ success: true });
      } catch (redditError) {
        console.error('Error sending message reply on Reddit:', redditError);
        return NextResponse.json({ 
          error: 'Failed to send reply on Reddit', 
          details: redditError instanceof Error ? redditError.message : 'Unknown error' 
        }, { status: 500 });
      }
    } catch (error) {
      console.error('Error sending message reply:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error sending message reply:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}