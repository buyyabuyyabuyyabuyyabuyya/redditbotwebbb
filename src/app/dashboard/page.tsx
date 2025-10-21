import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

import Dashboard from '@/components/Dashboard';
// COMMENTED OUT: BenoWorkflow and DiscussionCampaigns - Temporarily hidden from dashboard UI
// import BenoWorkflow from '@/components/beno-one/BenoWorkflow';
// import DiscussionCampaigns from '@/components/DiscussionCampaigns';

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const supabase = createSupabaseServerClient();

  // Fetch user's Reddit accounts
  const { data: redditAccounts } = await supabase
    .from('reddit_accounts')
    .select('*')
    .eq('user_id', userId);

  // Fetch user's message templates
  const { data: messageTemplates } = await supabase
    .from('message_templates')
    .select('*')
    .eq('user_id', userId);

  // Fetch user's sent messages
  const { data: sentMessages } = await supabase
    .from('sent_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
      <div className="py-8">
        <Dashboard />
      </div>
      
      {/* COMMENTED OUT: AI-Powered Reddit Outreach Section (BenoWorkflow)
          This includes the AI workflow and Discussion Campaigns
          To re-enable: Uncomment the imports above and the sections below */}
      {/* <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">AI-Powered Reddit Outreach</h2>
          <p className="text-gray-400">Automate your Reddit engagement with Beno's AI-generated replies</p>
        </div>
        <BenoWorkflow />
      </div> */}

      {/* COMMENTED OUT: Discussion Campaigns Section
          To re-enable: Uncomment the imports above and this section */}
      {/* <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DiscussionCampaigns />
      </div> */}

      {/* COMMENTED OUT: Recent Messages Section
          To re-enable: Uncomment this section */}
      {/* <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        <h3 className="text-xl font-semibold text-white mb-4">Recent Messages</h3>
        {sentMessages?.length === 0 ? (
          <p className="text-sm text-gray-500">No messages sent yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {sentMessages?.map((message) => (
              <li key={message.id} className="py-4">
                <div className="flex items-center space-x-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      To: {message.recipient}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      {message.content}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(message.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div> */}
    </div>
  );
}
