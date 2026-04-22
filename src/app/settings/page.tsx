import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import DuplicateSubscriptionWarning from '../../components/DuplicateSubscriptionWarning';
import CommentCounter from '../../components/CommentCounter';
import { Button3D } from '../../components/ui/Button';
import { createClient } from '@supabase/supabase-js';

export default async function Settings() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in?redirect_url=%2Fsettings');
  }

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

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  const { count: commentCount } = await supabaseAdmin
    .from('posted_reddit_discussions')
    .select('id, website_configs!inner(user_id)', {
      count: 'exact',
      head: true,
    })
    .eq('website_configs.user_id', userId);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="py-10">
        <header>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h1 className="bg-gradient-to-r from-purple-500 to-red-500 bg-clip-text text-3xl font-bold leading-tight tracking-tight text-transparent">
              Settings
            </h1>
          </div>
        </header>
        <main>
          <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div className="px-4 py-4 sm:px-0">
              <DuplicateSubscriptionWarning />
            </div>

            <div className="px-4 py-8 sm:px-0">
              <div className="overflow-hidden rounded-lg border border-gray-700/50 bg-gray-800/70 shadow-lg backdrop-blur-sm">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium leading-6 text-purple-300">
                    Subscription
                  </h3>
                  <div className="mt-5 rounded-md border border-purple-500/20 bg-gray-700/50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm text-purple-300">
                        Current plan:{' '}
                        <span className="font-semibold">
                          {user?.subscription_status === 'pro'
                            ? 'Pro'
                            : user?.subscription_status === 'advanced'
                              ? 'Advanced'
                              : 'Free'}
                        </span>
                      </p>
                      {user?.subscription_status === 'free' && (
                        <Link
                          href="/pricing"
                          className="text-sm font-medium text-purple-300 hover:text-purple-200"
                        >
                          Upgrade to Pro →
                        </Link>
                      )}
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500">
                          Comments Posted
                        </dt>
                        <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                          <CommentCounter initialCount={commentCount || 0} />
                        </dd>
                      </div>
                      <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500">
                          Plan Limit
                        </dt>
                        <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                          {user?.subscription_status === 'pro'
                            ? '200 / month'
                            : user?.subscription_status === 'advanced'
                              ? 'Unlimited'
                              : '15 / month'}
                        </dd>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-8 sm:px-0">
              <div className="rounded-lg border border-gray-700/50 bg-gray-800/70 shadow-lg backdrop-blur-sm">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium leading-6 text-purple-300">
                    Manage Subscription
                  </h3>
                  <div className="mt-5">
                    <Link
                      href="https://billing.stripe.com/p/login/eVq28q2C70PF1OJaxg2wU00"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button3D>Open Billing Portal</Button3D>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-8 sm:px-0">
              <div className="rounded-lg border border-gray-700/50 bg-gray-800/70 shadow-lg backdrop-blur-sm">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium leading-6 text-red-400">
                    Delete Account
                  </h3>
                  <div className="mt-2 max-w-xl text-sm text-gray-300">
                    <p>
                      Permanently delete your account and all associated data.
                      This action cannot be undone.
                    </p>
                  </div>
                  <div className="mt-5">
                    <button
                      type="button"
                      className="inline-flex items-center rounded-md border border-red-500/30 bg-red-600/80 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-red-500"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
