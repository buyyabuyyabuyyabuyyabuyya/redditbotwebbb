import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import LogArchiveButton from '../../components/LogArchiveButton';

// Create a Supabase admin client
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

interface ArchivedLog {
  id: string;
  config_id: string;
  file_path: string;
  log_count: number;
  date_range_start: string;
  date_range_end: string;
  created_at: string;
  scan_configs?: {
    subreddit: string;
  };
}

export default async function FileLogsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Fetch all archived logs for this user
  const { data: archivedLogs, error } = await supabaseAdmin
    .from('archived_logs')
    .select(
      `
      *,
      scan_configs (
        subreddit
      )
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching archived logs:', error);
  }

  // Generate signed URLs for each file
  const logsWithUrls = await Promise.all(
    (archivedLogs || []).map(async (log) => {
      const { data: signedUrl } = await supabaseAdmin.storage
        .from('logs')
        .createSignedUrl(log.file_path, 30 * 60); // URL valid for 1 hour

      return {
        ...log,
        downloadUrl: signedUrl?.signedUrl,
      };
    })
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="py-10">
        <header>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-red-500">
              Archived Bot Logs
            </h1>
            <p className="mt-2 text-lg text-gray-300">
              Download archived log files to free up database space
            </p>
          </div>
        </header>

        <main>
          <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div className="px-4 py-8 sm:px-0">
              <div className="flex justify-between mb-4">
                <LogArchiveButton />
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-purple-300 hover:text-purple-200"
                >
                  Back to Dashboard
                </Link>
              </div>

              {logsWithUrls?.length === 0 ? (
                <div className="text-center py-12">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-300">
                    No archived logs
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Logs are archived when you have at least 100 logs for a
                    configuration
                  </p>
                </div>
              ) : (
                <div className="shadow overflow-hidden border border-gray-700 sm:rounded-lg">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                        >
                          Subreddit
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                        >
                          Date Range
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                        >
                          Logs
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                        >
                          Created
                        </th>
                        <th scope="col" className="relative px-6 py-3">
                          <span className="sr-only">Download</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-gray-800/50 divide-y divide-gray-700">
                      {logsWithUrls?.map((log) => {
                        const startDate = new Date(
                          log.date_range_start
                        ).toLocaleString();
                        const endDate = new Date(
                          log.date_range_end
                        ).toLocaleString();
                        const createdAt = new Date(
                          log.created_at
                        ).toLocaleString();

                        return (
                          <tr key={log.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-purple-300">
                              r/{log.scan_configs?.subreddit || 'unknown'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-300">
                              <div className="text-xs">{startDate}</div>
                              <div className="text-xs text-gray-400">to</div>
                              <div className="text-xs">{endDate}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                              {log.log_count} entries
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                              {createdAt}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              {log.downloadUrl ? (
                                <a
                                  href={log.downloadUrl}
                                  download={`logs_${log.scan_configs?.subreddit || 'bot'}_${new Date(log.date_range_start).toISOString().split('T')[0]}.txt`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-400 hover:text-indigo-300"
                                >
                                  Download
                                </a>
                              ) : (
                                <span className="text-gray-500">
                                  Unavailable
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-8 bg-gray-800/70 rounded-lg p-4 border border-gray-700 text-sm">
                <h3 className="font-medium text-gray-300 mb-2">
                  About Log Archival
                </h3>
                <ul className="list-disc list-inside text-gray-400 space-y-1">
                  <li>
                    Logs are automatically archived in batches of 100 to save
                    database space
                  </li>
                  <li>
                    Each archive contains logs for a specific bot configuration
                  </li>
                  <li>
                    Archived logs are stored as text files that you can download
                    and view
                  </li>
                  <li>
                    Archived logs are removed from the database after being
                    stored as files
                  </li>
                  <li>Download links are valid for 1 hour after page load</li>
                </ul>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
