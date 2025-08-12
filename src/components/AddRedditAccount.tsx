import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useUserPlan } from '../hooks/useUserPlan';

interface AddRedditAccountProps {
  userId: string;
  onSuccess: () => void;
  account?: {
    id: string;
    username: string;
    password: string;
    client_id?: string;
    client_secret?: string;
  } | null;
}

export default function AddRedditAccount({
  userId,
  onSuccess,
  account = null,
}: AddRedditAccountProps) {
  const { user } = useUser();
  const isEdit = !!account;
  const [username, setUsername] = useState(account?.username || '');
  const [password, setPassword] = useState(account?.password || '');
  const [clientId, setClientId] = useState((account as any)?.client_id || '');
  const [clientSecret, setClientSecret] = useState((account as any)?.client_secret || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClientSecret, setShowClientSecret] = useState(false);
  // Proxy state (paid plans only)
  const { isProUser } = useUserPlan();
  const [proxyEnabled, setProxyEnabled] = useState<boolean>((account as any)?.proxy_enabled || false);
  const [proxyType, setProxyType] = useState<string>((account as any)?.proxy_type || 'http');
  const [proxyHost, setProxyHost] = useState<string>((account as any)?.proxy_host || '');
  const [proxyPort, setProxyPort] = useState<number | ''>((account as any)?.proxy_port || '');
  const [proxyUsername, setProxyUsername] = useState<string>((account as any)?.proxy_username || '');
  const [proxyPassword, setProxyPassword] = useState<string>('');
  const [proxyTesting, setProxyTesting] = useState<boolean>(false);
  const [proxyTestResult, setProxyTestResult] = useState<string | null>(null);

  // Keep local state in sync if the account prop changes
  useEffect(() => {
    if (account) {
      setUsername(account.username || '');
      setPassword(account.password || '');
      setClientId((account as any)?.client_id || '');
      setClientSecret((account as any)?.client_secret || '');
      setProxyEnabled((account as any)?.proxy_enabled || false);
      setProxyType((account as any)?.proxy_type || 'http');
      setProxyHost((account as any)?.proxy_host || '');
      setProxyPort((account as any)?.proxy_port || '');
      setProxyUsername((account as any)?.proxy_username || '');
      setProxyPassword((account as any)?.proxy_password || '');
    }
  }, [account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // First, validate the Reddit credentials
      const validateResponse = await fetch('/api/reddit/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          clientId,
          clientSecret,
        }),
      });

      if (!validateResponse.ok) {
        const validateData = await validateResponse.json();
        throw new Error(
          validateData.error || 'Failed to validate Reddit credentials'
        );
      }

      // If validation succeeds, use our API endpoint to save the account
      const saveResponse = await fetch(isEdit ? `/api/reddit/account?id=${account?.id}` : '/api/reddit/account', {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          clientId,
          clientSecret,
          // Proxy fields (only include when user is paid)
          ...(isProUser ? {
            proxyEnabled,
            proxyType,
            proxyHost,
            proxyPort: proxyPort === '' ? null : Number(proxyPort),
            proxyUsername,
            // Only send proxyPassword if provided (avoid overwriting with empty)
            ...(proxyPassword ? { proxyPassword } : {}),
          } : {}),
        }),
      });

      const saveData = await saveResponse.json();

      if (!saveResponse.ok) {
        console.error('Server response error:', saveData);
        throw new Error(saveData.error || 'Failed to save account to database');
      }

      console.log('Reddit account saved successfully!');
      onSuccess();
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 shadow sm:rounded-lg border border-gray-700">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-white">
          {isEdit ? 'Edit Reddit Account' : 'Add Reddit Account'}
        </h3>
        <div className="mt-2 max-w-xl text-sm text-gray-300">
          <p>Add your Reddit account credentials to start sending messages.</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-200"
            >
              Reddit Username
            </label>
            <div className="mt-1">
              <input
                type="text"
                name="username"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder-gray-400"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-200"
            >
              Reddit Password
            </label>
            <div className="mt-1">
              <input
                type="password"
                name="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder-gray-400"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="clientId"
              className="block text-sm font-medium text-gray-200"
            >
              Reddit Client ID
            </label>
            <div className="mt-1">
              <input
                type="text"
                name="clientId"
                id="clientId"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder-gray-400"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="clientSecret"
              className="block text-sm font-medium text-gray-200"
            >
              Reddit Client Secret
            </label>
            <div className="mt-1 relative">
              <input
                type={showClientSecret ? 'text' : 'password'}
                name="clientSecret"
                id="clientSecret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="block w-full pr-10 rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder-gray-400"
                required
              />
              <button
                type="button"
                onClick={() => setShowClientSecret(!showClientSecret)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-white focus:outline-none"
                aria-label={showClientSecret ? 'Hide secret' : 'Show secret'}
              >
                {showClientSecret ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-900/30 border border-red-800 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-400">Error</h3>
                  <div className="mt-2 text-sm text-red-300">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
            >
              {isLoading ? (isEdit ? 'Saving...' : 'Adding...') : isEdit ? 'Save Changes' : 'Add Account'}
            </button>
          </div>

          {/* Proxy configuration (paid plans only) */}
          {isProUser && (
            <div className="mt-6 border-t border-gray-700 pt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-md font-semibold text-gray-200">Proxy (per account)</h4>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={proxyEnabled}
                    onChange={(e) => setProxyEnabled(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 relative" />
                  <span className="ml-3 text-sm text-gray-300">Enable</span>
                </label>
              </div>
              <div className={`${proxyEnabled ? '' : 'opacity-50 pointer-events-none'} grid grid-cols-1 sm:grid-cols-2 gap-4`}>
                <div>
                  <label className="block text-sm font-medium text-gray-200">Type</label>
                  <select
                    value={proxyType}
                    onChange={(e) => setProxyType(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200">Host</label>
                  <input
                    type="text"
                    value={proxyHost}
                    onChange={(e) => setProxyHost(e.target.value)}
                    placeholder="proxy.example.com"
                    className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200">Port</label>
                  <input
                    type="number"
                    value={proxyPort}
                    onChange={(e) => setProxyPort(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="3128"
                    className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200">Username (optional)</label>
                  <input
                    type="text"
                    value={proxyUsername}
                    onChange={(e) => setProxyUsername(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200">Password (optional)</label>
                  <input
                    type="password"
                    value={proxyPassword}
                    onChange={(e) => setProxyPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder-gray-400"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center space-x-3">
                <button
                  type="button"
                  disabled
                  onClick={async () => {
                    // Placeholder for future proxy test endpoint
                    setProxyTesting(true);
                    setProxyTestResult(null);
                    try {
                      // To be implemented in server routes step
                    } finally {
                      setProxyTesting(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-md text-sm bg-gray-700 text-gray-300 cursor-not-allowed"
                  title="Will be enabled after server routes are added"
                >
                  Test Proxy
                </button>
                {proxyTestResult && (
                  <span className="text-sm text-gray-300">{proxyTestResult}</span>
                )}
              </div>
            </div>
          )}
          {!isProUser && (
            <div className="mt-6 border-t border-gray-700 pt-4">
              <h4 className="text-md font-semibold text-gray-200">Proxy (Pro feature)</h4>
              <p className="text-sm text-gray-400">Upgrade to Pro to route account traffic through your own HTTP/HTTPS/SOCKS5 proxy.</p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
