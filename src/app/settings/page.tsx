import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '../../utils/supabase-server';
import { Button3D, RippleButton } from '../../components/ui/Button';
import Link from 'next/link';
import MessageCounter from '../../components/MessageCounter';
import { createClient } from '@supabase/supabase-js';

// Using the imported createServerSupabaseClient function

interface User {
  id: string;
  subscription_status: 'free' | 'pro' | 'advanced';
  message_count: number;
}

export default async function Settings() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Create admin client to bypass RLS and ensure we get accurate subscription data
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

  // Fetch user data using admin client for accurate subscription status
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  // Log the user data for debugging
  console.log('User data from admin client:', user);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="py-10">
        <header>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-red-500">
              Settings
            </h1>
          </div>
        </header>
        <main>
          <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
            {/* Subscription Section */}
            <div className="px-4 py-8 sm:px-0">
              <div className="rounded-lg bg-gray-800/70 shadow-lg border border-gray-700/50 backdrop-blur-sm overflow-hidden">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium leading-6 text-purple-300">
                    Subscription
                  </h3>
                  <div className="mt-5">
                    <div className="rounded-md bg-gray-700/50 p-4 border border-purple-500/20">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg
                            className="h-5 w-5 text-purple-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <div className="ml-3 flex-1 md:flex md:justify-between">
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
                            <p className="mt-3 text-sm md:mt-0 md:ml-6">
                              <Link
                                href="/pricing"
                                className="whitespace-nowrap font-medium text-purple-300 hover:text-purple-200 transition-colors"
                              >
                                Upgrade to Pro{' '}
                                <span aria-hidden="true">&rarr;</span>
                              </Link>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-6">
                      <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                          <dt className="truncate text-sm font-medium text-gray-500">
                            Messages Sent
                          </dt>
                          <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                            <MessageCounter
                              initialCount={user?.message_count || 0}
                              userId={userId}
                            />
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
                                : '15'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Reddit Accounts Section */}
            <div className="px-4 py-8 sm:px-0">
              <div className="rounded-lg bg-gray-800/70 shadow-lg border border-gray-700/50 backdrop-blur-sm">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium leading-6 text-purple-300">
                    Reddit Accounts
                  </h3>
                  <div className="mt-2 max-w-xl text-sm text-gray-300">
                    <p>
                      Manage your Reddit accounts. Add up to{' '}
                      <span className="font-semibold text-white">
                        {user?.subscription_status === 'pro'
                          ? '3'
                          : user?.subscription_status === 'advanced'
                            ? 'Unlimited'
                            : '1'}
                      </span>{' '}
                      accounts.
                    </p>
                  </div>
                  <div className="mt-5">
                    <Link href="/dashboard">
                      <Button3D>Manage Accounts</Button3D>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Account Settings Section */}
            <div className="px-4 py-8 sm:px-0">
              <div className="rounded-lg bg-gray-800/70 shadow-lg border border-gray-700/50 backdrop-blur-sm">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium leading-6 text-purple-300">
                    Account Settings
                  </h3>
                  <div className="mt-5">
                    <div className="space-y-6">
                      <div>
                        <label
                          htmlFor="email"
                          className="block text-sm font-medium text-gray-300"
                        >
                          Email
                        </label>
                        <div className="mt-1">
                          <input
                            type="email"
                            name="email"
                            id="email"
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            placeholder="you@example.com"
                            disabled={false}
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="timezone"
                          className="block text-sm font-medium text-gray-300"
                        >
                          Timezone
                        </label>
                        <div className="mt-1">
                          <select
                            id="timezone"
                            name="timezone"
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          >
                            <option>UTC</option>
                            <option>America/New_York</option>
                            <option>America/Los_Angeles</option>
                            <option>Europe/London</option>
                            <option>Asia/Tokyo</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="notifications"
                          className="block text-sm font-medium text-gray-300"
                        >
                          Email Notifications
                        </label>
                        <div className="mt-2 space-y-4">
                          <div className="flex items-start">
                            <div className="flex h-5 items-center">
                              <input
                                id="notifications"
                                name="notifications"
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            </div>
                            <div className="ml-3 text-sm">
                              <label
                                htmlFor="notifications"
                                className="font-medium text-gray-300"
                              >
                                Receive email notifications
                              </label>
                              <p className="text-gray-300">
                                Get notified about important updates and account
                                activity.
                              </p>
                            </div>
                            <div className="ml-3 text-sm"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Account Deletion Section */}
            <div className="px-4 py-8 sm:px-0">
              <div className="rounded-lg bg-gray-800/70 shadow-lg border border-gray-700/50 backdrop-blur-sm">
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
                      className="inline-flex items-center rounded-md bg-red-600/80 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 border border-red-500/30 transition-colors duration-200"
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
