import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import DuplicateSubscriptionWarning from '../../components/DuplicateSubscriptionWarning';
import CommentCounter from '../../components/CommentCounter';
import { createClient } from '@supabase/supabase-js';
import { getPlanLimits } from '@/utils/planLimits';

export default async function Settings() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in?redirect_url=%2Fsettings');
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  const { data: configs } = await supabaseAdmin
    .from('website_configs')
    .select('id')
    .eq('user_id', userId);
  const configIds = (configs || []).map((config) => config.id);
  const { count: commentCount } =
    configIds.length > 0
      ? await supabaseAdmin
          .from('posted_reddit_discussions')
          .select('id', {
            count: 'exact',
            head: true,
          })
          .in('website_config_id', configIds)
      : { count: 0 };
  const planStatus = user?.subscription_status || 'free';
  const limits = getPlanLimits(planStatus);
  const planLabel =
    planStatus === 'pro'
      ? 'Pro'
      : planStatus === 'advanced' || planStatus === 'elite'
        ? 'Elite'
        : 'Free';

  return (
    <div className="min-h-screen bg-zinc-950 py-12 text-zinc-100">
      <div className="section-shell space-y-8">
        <div>
          <p className="page-kicker">Settings</p>
          <h1 className="page-title mt-3">
            Billing, plan usage, and workspace controls
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
            Manage your subscription, monitor monthly posting capacity, and
            review workspace-level controls.
          </p>
        </div>

        <DuplicateSubscriptionWarning />

        <section className="surface-card p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-50">
                Subscription overview
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                Current plan and usage for this billing cycle.
              </p>
            </div>
            {user?.subscription_status === 'free' ? (
              <Link href="/pricing" className="ui-button-primary">
                Upgrade plan
              </Link>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="surface-subtle p-5">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Current plan
              </div>
              <div className="mt-3 text-2xl font-semibold text-zinc-50">
                {planLabel}
              </div>
            </div>
            <div className="surface-subtle p-5">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Total comments posted
              </div>
              <div className="mt-3 text-2xl font-semibold text-zinc-50">
                <CommentCounter initialCount={commentCount || 0} />
              </div>
            </div>
            <div className="surface-subtle p-5">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Plan limit
              </div>
              <div className="mt-3 text-2xl font-semibold text-zinc-50">
                {limits.monthlyCommentLimit.toLocaleString()} / month
              </div>
            </div>
          </div>
        </section>

        <section className="surface-card p-6">
          <h2 className="text-lg font-semibold text-zinc-50">Billing</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Open the Stripe billing portal to update payment methods or manage
            your subscription.
          </p>
          <div className="mt-5">
            <Link
              href="https://billing.stripe.com/p/login/eVq28q2C70PF1OJaxg2wU00"
              target="_blank"
              rel="noopener noreferrer"
              className="ui-button-secondary"
            >
              Open billing portal
            </Link>
          </div>
        </section>

        <section className="surface-card border-red-100 p-6">
          <h2 className="text-lg font-semibold text-red-700">Danger zone</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </p>
          <div className="mt-5">
            <button type="button" className="ui-button-danger">
              Delete account
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
