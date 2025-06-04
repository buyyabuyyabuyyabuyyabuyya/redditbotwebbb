import { useState } from 'react';
import { useUser } from '@clerk/nextjs';

interface AddRedditAccountProps {
  userId: string;
  onSuccess: () => void;
}

export default function AddRedditAccount({
  userId,
  onSuccess,
}: AddRedditAccountProps) {
  const { user } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const saveResponse = await fetch('/api/reddit/account', {
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
          Add Reddit Account
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
            <div className="mt-1">
              <input
                type="password"
                name="clientSecret"
                id="clientSecret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder-gray-400"
                required
              />
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
              {isLoading ? 'Adding...' : 'Add Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
