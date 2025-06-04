import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import MessageInbox from '@/components/MessageInbox';

export default async function PrivateMessages() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Create admin client to get user data
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

  // Fetch user data
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  // Fetch user's Reddit accounts
  const { data: accounts } = await supabaseAdmin
    .from('reddit_accounts')
    .select('*')
    .eq('user_id', userId);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="py-10">
        <header>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-red-500">
              Private Messages Inbox
            </h1>
          </div>
        </header>
        <main>
          <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div className="px-4 py-8 sm:px-0">
              <div className="rounded-lg bg-gray-800/70 shadow-lg border border-gray-700/50 backdrop-blur-sm">
                <div className="px-4 py-5 sm:p-6">
                  {/* Client-side component for account selection and message viewing */}
                  <MessageInbox accounts={accounts || []} userId={userId} />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
