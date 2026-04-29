import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import LogArchiveButton from '../../components/LogArchiveButton';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

interface ArchivedLog {
  id: string;
  config_id: string;
  file_path: string;
  log_count: number;
  date_range_start: string;
  date_range_end: string;
  created_at: string;
  scan_configs?: { subreddit: string };
}

export default async function FileLogsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in?redirect_url=%2Ffile-logs');

  const { data: archivedLogs } = await supabaseAdmin
    .from('archived_logs')
    .select(`*, scan_configs ( subreddit )`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const logsWithUrls = await Promise.all(
    (archivedLogs || []).map(async (log: ArchivedLog) => {
      const { data: signedUrl } = await supabaseAdmin.storage
        .from('logs')
        .createSignedUrl(log.file_path, 30 * 60);
      return { ...log, downloadUrl: signedUrl?.signedUrl };
    })
  );

  return (
    <div className="min-h-screen bg-zinc-950 py-12 text-zinc-100">
      <div className="section-shell space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="page-kicker">File logs</p>
            <h1 className="page-title mt-3">Archived bot logs</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
              Download archived log files when you need historical diagnostics
              without keeping everything in the live database.
            </p>
          </div>
          <div className="flex gap-3">
            <LogArchiveButton subreddit="_system" />
            <Link href="/dashboard" className="ui-button-secondary">
              Back to dashboard
            </Link>
          </div>
        </div>

        {logsWithUrls?.length === 0 ? (
          <section className="surface-card p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 text-zinc-400">
              <svg
                className="h-7 w-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h2 className="mt-6 text-xl font-semibold text-zinc-100">
              No archived logs yet
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
              Archives are created when a configuration builds up enough logs.
              Once available, this page will let you download them as text
              files.
            </p>
          </section>
        ) : (
          <section className="surface-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-zinc-900">
                  <tr>
                    {[
                      'Subreddit',
                      'Date range',
                      'Log count',
                      'Archived',
                      'Download',
                    ].map((label) => (
                      <th
                        key={label}
                        className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.2em] text-zinc-500"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-zinc-950">
                  {logsWithUrls.map((log: any) => {
                    const startDate = new Date(
                      log.date_range_start
                    ).toLocaleString();
                    const endDate = new Date(
                      log.date_range_end
                    ).toLocaleString();
                    const createdAt = new Date(log.created_at).toLocaleString();
                    return (
                      <tr key={log.id}>
                        <td className="px-6 py-4 text-sm font-medium text-zinc-100">
                          r/{log.scan_configs?.subreddit || 'unknown'}
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500">
                          <div>{startDate}</div>
                          <div className="my-1 text-xs uppercase tracking-[0.2em] text-zinc-400">
                            to
                          </div>
                          <div>{endDate}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-700">
                          {log.log_count} entries
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500">
                          {createdAt}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {log.downloadUrl ? (
                            <a
                              href={log.downloadUrl}
                              download={`logs_${log.scan_configs?.subreddit || 'bot'}_${new Date(log.date_range_start).toISOString().split('T')[0]}.txt`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-zinc-100 underline-offset-4 hover:underline"
                            >
                              Download
                            </a>
                          ) : (
                            <span className="text-zinc-400">Unavailable</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="surface-subtle p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
            How archival works
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
              Logs are archived in batches to keep the live database lighter and
              easier to query.
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
              Each archive file is specific to one configuration and can be
              downloaded for manual review.
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
              Archive links are temporary and refresh whenever you reload the
              page.
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
              Use Archive Logs Now only when you intentionally want to clean
              down the live log table.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
