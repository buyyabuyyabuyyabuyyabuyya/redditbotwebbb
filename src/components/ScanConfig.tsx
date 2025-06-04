import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { createClientSupabaseClient } from '../utils/supabase';
import { useUserPlan } from '../hooks/useUserPlan';

interface ScanConfigProps {
  userId: string;
  onSuccess?: () => void;
}

export default function ScanConfig({ userId, onSuccess }: ScanConfigProps) {
  const [subreddits, setSubreddits] = useState('');
  const [keywords, setKeywords] = useState('');
  const [scanInterval, setScanInterval] = useState(30);
  const [messageTemplateId, setMessageTemplateId] = useState('');
  const [redditAccountId, setRedditAccountId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageTemplates, setMessageTemplates] = useState<any[]>([]);
  const [redditAccounts, setRedditAccounts] = useState<any[]>([]);
  const [activeBots, setActiveBots] = useState<any[]>([]);
  const { plan, remaining, isProUser } = useUserPlan();

  useEffect(() => {
    // Fetch available message templates and Reddit accounts
    async function fetchData() {
      try {
        // Get message templates using API endpoint
        const templatesResponse = await fetch('/api/reddit/templates');
        const templatesData = await templatesResponse.json();

        if (templatesResponse.ok && templatesData.templates) {
          console.log('Templates loaded:', templatesData.templates);
          setMessageTemplates(templatesData.templates);
        } else {
          console.error(
            'Error loading templates:',
            templatesData.error || 'Unknown error'
          );
        }

        // Get Reddit accounts using API endpoint
        const accountsResponse = await fetch('/api/reddit/account');
        const accountsData = await accountsResponse.json();

        if (accountsResponse.ok && accountsData.accounts) {
          console.log('Accounts loaded:', accountsData.accounts);
          setRedditAccounts(accountsData.accounts);
        } else {
          console.error(
            'Error loading accounts:',
            accountsData.error || 'Unknown error'
          );
        }

        // Load active bots
        await fetchActiveBots();
      } catch (err) {
        console.error('Error in fetchData:', err);
      }
    }

    fetchData();
  }, [userId]);

  // Function to fetch active bots
  const fetchActiveBots = async () => {
    try {
      const supabase = createClientSupabaseClient();
      const { data: configs, error } = await supabase
        .from('scan_configs')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (configs) {
        setActiveBots(configs);
      } else if (error) {
        console.error('Error loading scan configs:', error);
      }
    } catch (err) {
      console.error('Error fetching active bots:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const keywordsArray = keywords.split(',').map((k) => k.trim());

      // Check if user has reached message limit
      if (!isProUser && remaining === 0) {
        setError(
          'You have reached your message limit. Please upgrade to Pro for unlimited messages.'
        );
        return;
      }

      // Use the API endpoint instead of direct Supabase calls
      const response = await fetch('/api/reddit/scan-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subreddit: subreddits,
          keywords: keywordsArray,
          messageTemplateId: messageTemplateId,
          redditAccountId: redditAccountId,
          scanInterval: scanInterval,
          isActive: false,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Server response error:', data);
        throw new Error(data.error || 'Failed to create scan configuration');
      }

      console.log('Scan configuration created successfully!');

      // After successful creation, refresh active bots list
      await fetchActiveBots();

      if (onSuccess) {
        onSuccess();
      }

      // Reset form
      setSubreddits('');
      setKeywords('');
      setScanInterval(30);
      setMessageTemplateId('');
      setRedditAccountId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBotStatus = async (botId: string, currentStatus: boolean) => {
    setIsLoading(true);

    try {
      const supabase = createClientSupabaseClient();

      const { error } = await supabase
        .from('scan_configs')
        .update({ is_active: !currentStatus })
        .eq('id', botId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      // Log the action to bot_logs
      await supabaseAdmin.from('bot_logs').insert([
        {
          user_id: userId,
          account_id: activeBots.find((bot) => bot.id === botId)
            ?.reddit_account_id,
          subreddit: activeBots.find((bot) => bot.id === botId)?.subreddit,
          action: currentStatus ? 'stop_bot' : 'start_bot',
          status: 'success',
        },
      ]);

      // Refresh the list of active bots
      const { data: configs } = await supabase
        .from('scan_configs')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (configs) {
        setActiveBots(configs);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update bot status'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 shadow sm:rounded-lg border border-gray-700">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-white">
          Configure Subreddit Scanner
        </h3>
        <div className="mt-2 max-w-xl text-sm text-gray-300">
          <p>Create a new subreddit scanning configuration for your bot.</p>
        </div>

        {error && <div className="mt-2 text-sm text-red-500">{error}</div>}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="subreddits"
              className="block text-sm font-medium text-gray-300"
            >
              Subreddits (comma separated)
            </label>
            <input
              type="text"
              name="subreddits"
              id="subreddits"
              value={subreddits}
              onChange={(e) => setSubreddits(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-700 bg-gray-700 shadow-sm text-white sm:text-sm"
              required
            />
          </div>

          <div>
            <label
              htmlFor="keywords"
              className="block text-sm font-medium text-gray-300"
            >
              Keywords to Match (comma separated)
            </label>
            <input
              type="text"
              name="keywords"
              id="keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-700 bg-gray-700 shadow-sm text-white sm:text-sm"
              required
            />
          </div>

          <div>
            <label
              htmlFor="scanInterval"
              className="block text-sm font-medium text-gray-300"
            >
              Scan Interval (seconds)
            </label>
            <input
              type="number"
              name="scanInterval"
              id="scanInterval"
              min="30"
              value={scanInterval}
              onChange={(e) => setScanInterval(parseInt(e.target.value))}
              className="mt-1 block w-full rounded-md border-gray-700 bg-gray-700 shadow-sm text-white sm:text-sm"
              required
            />
          </div>

          <div>
            <label
              htmlFor="messageTemplate"
              className="block text-sm font-medium text-gray-300"
            >
              Message Template
            </label>
            <select
              id="messageTemplate"
              name="messageTemplate"
              value={messageTemplateId}
              onChange={(e) => setMessageTemplateId(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-700 bg-gray-700 shadow-sm text-white sm:text-sm"
              required
            >
              <option value="">Select a template</option>
              {messageTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="redditAccount"
              className="block text-sm font-medium text-gray-300"
            >
              Reddit Account
            </label>
            <select
              id="redditAccount"
              name="redditAccount"
              value={redditAccountId}
              onChange={(e) => setRedditAccountId(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-700 bg-gray-700 shadow-sm text-white sm:text-sm"
              required
            >
              <option value="">Select an account</option>
              {redditAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.username}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            {isLoading ? 'Creating...' : 'Create Configuration'}
          </button>
        </form>

        {activeBots.length > 0 && (
          <div className="mt-8">
            <h4 className="text-md font-medium text-white">Active Bots</h4>
            <div className="mt-4 space-y-4">
              {activeBots.map((bot) => (
                <div
                  key={bot.id}
                  className="flex justify-between items-center p-3 bg-gray-700 rounded-md"
                >
                  <div>
                    <span className="text-sm text-white font-medium">
                      r/{bot.subreddit}
                    </span>
                    <p className="text-xs text-gray-300">
                      Scanning every {bot.scan_interval} seconds
                    </p>
                  </div>
                  <button
                    onClick={() => toggleBotStatus(bot.id, bot.is_active)}
                    className={`px-3 py-1 text-xs font-medium rounded-md ${
                      bot.is_active
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {bot.is_active ? 'Stop' : 'Start'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
