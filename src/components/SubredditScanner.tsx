'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { createClientSupabaseClient } from '../utils/supabase';
import { useUserPlan } from '../hooks/useUserPlan';
import Button, { RippleButton, Button3D } from './ui/Button';
import LogViewer from './LogViewer';
import BotStatusDisplay from './BotStatusDisplay';
import UpgradePrompt from './UpgradePrompt';

const supabase = createClientSupabaseClient();

interface SubredditScannerProps {
  userId: string;
  redditAccounts: Array<{
    id: string;
    username: string;
  }>;
  messageTemplates: Array<{
    id: string;
    name: string;
    content: string;
  }>;
}

interface ScanConfig {
  id?: string;
  subreddit: string;
  keywords: string[];
  messageTemplateId: string;
  redditAccountId: string;
  isActive: boolean;
  scanInterval: number; // in minutes
  useAiCheck?: boolean; // Flag to use AI for relevance checking (camelCase version)
  use_ai_check?: boolean; // Flag to use AI for relevance checking (snake_case from DB)
}

export default function SubredditScanner({
  userId,
  redditAccounts,
  messageTemplates,
}: SubredditScannerProps) {
  const [configs, setConfigs] = useState<ScanConfig[]>([]);
  const [newConfig, setNewConfig] = useState<ScanConfig>({
    subreddit: '',
    keywords: [],
    messageTemplateId: '',
    redditAccountId: '',
    isActive: false,
    scanInterval: 10,
    useAiCheck: true, // Default to using AI check
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Add refreshTrigger state for real-time log updates
  const [editingConfig, setEditingConfig] = useState<ScanConfig | null>(null); // Track config being edited

  // Get user plan information at the component level
  const { plan, remaining, isProUser } = useUserPlan();

  useEffect(() => {
    loadConfigs();
  }, []);

  // Helper to normalize data between camelCase and snake_case
  const normalizeConfig = (config: any): ScanConfig => {
    // For each config loaded from DB, ensure both property formats are available
    return {
      ...config,
      // Ensure useAiCheck is set from use_ai_check if needed
      useAiCheck:
        config.useAiCheck !== undefined
          ? config.useAiCheck
          : config.use_ai_check,
    };
  };

  const loadConfigs = async () => {
    try {
      // Use the API endpoint instead of direct Supabase calls
      const response = await fetch('/api/reddit/scan-config');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load configurations');
      }

      console.log('Loaded scan configs:', data);
      // Normalize all configs to have both property formats
      const normalizedConfigs = (data.configs || []).map(normalizeConfig);
      setConfigs(normalizedConfigs);
    } catch (err) {
      console.error('Error loading configurations:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load configurations'
      );
    }
  };

  const handleAddKeyword = () => {
    if (keyword.trim()) {
      // Split by comma and process each keyword
      const keywordsToAdd = keyword
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k !== '');

      // Filter out duplicates and keywords that already exist
      const newKeywords = keywordsToAdd.filter(
        (k) => !newConfig.keywords.includes(k)
      );

      if (newKeywords.length > 0) {
        setNewConfig({
          ...newConfig,
          keywords: [...newConfig.keywords, ...newKeywords],
        });
      }

      setKeyword('');
    }
  };

  const handleRemoveKeyword = (indexToRemove: number) => {
    setNewConfig({
      ...newConfig,
      keywords: newConfig.keywords.filter(
        (_, index) => index !== indexToRemove
      ),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validate required fields before submission
    if (!newConfig.messageTemplateId || !newConfig.redditAccountId) {
      setError('Please select a message template and Reddit account');
      setIsLoading(false);
      return;
    }

    // Validate scan interval range
    if (newConfig.scanInterval < 10 || newConfig.scanInterval > 300) {
      setError('Scan interval must be between 10 and 300 minutes');
      setIsLoading(false);
      return;
    }

    try {
      const isEditing = !!editingConfig;

      // Log the operation type and data
      console.log(
        `${isEditing ? 'Updating' : 'Creating'} config with template ID:`,
        newConfig.messageTemplateId
      );

      if (isEditing && editingConfig?.id) {
        // Update existing configuration using the admin API endpoint
        const response = await fetch('/api/reddit/admin-scan-config', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: editingConfig.id,
            subreddit: newConfig.subreddit,
            keywords: newConfig.keywords,
            messageTemplateId: newConfig.messageTemplateId,
            redditAccountId: newConfig.redditAccountId,
            scanInterval: newConfig.scanInterval,
            useAiCheck: newConfig.useAiCheck,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to update configuration');
        }

        console.log('Configuration updated successfully!');
      } else {
        // Create new configuration
        const response = await fetch('/api/reddit/scan-config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subreddit: newConfig.subreddit,
            keywords: newConfig.keywords,
            messageTemplateId: newConfig.messageTemplateId,
            redditAccountId: newConfig.redditAccountId,
            scanInterval: newConfig.scanInterval,
            isActive: newConfig.isActive,
            useAiCheck: newConfig.useAiCheck,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error('Server response error:', data);
          throw new Error(data.error || 'Failed to save configuration');
        }

        console.log('Configuration created successfully!');
      }

      // Refresh configs list
      await loadConfigs();

      // Reset form and editing state
      setNewConfig({
        subreddit: '',
        keywords: [],
        messageTemplateId: '',
        redditAccountId: '',
        isActive: false,
        scanInterval: 10,
        useAiCheck: true,
      });
      setEditingConfig(null);
    } catch (err) {
      console.error('Error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to save configuration'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Function to delete a configuration
  const deleteConfig = async (configId: string) => {
    if (!confirm('Are you sure you want to delete this bot configuration?')) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use the admin API endpoint
      const response = await fetch(
        `/api/reddit/admin-scan-config?id=${configId}`,
        {
          method: 'DELETE',
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete configuration');
      }

      // Refresh the configs list
      await loadConfigs();
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      console.error('Error deleting configuration:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to delete configuration'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Function to edit a configuration
  const editConfig = (config: ScanConfig) => {
    // Make sure we don't end up with undefined values that would trigger uncontrolled/controlled warnings
    setNewConfig({
      subreddit: config.subreddit || '',
      keywords: config.keywords || [],
      messageTemplateId:
        config.messageTemplateId || (config as any).message_template_id || '',
      redditAccountId:
        config.redditAccountId || (config as any).reddit_account_id || '',
      isActive: config.isActive || false,
      scanInterval: config.scanInterval || (config as any).scan_interval || 10,
      useAiCheck:
        config.useAiCheck !== undefined
          ? config.useAiCheck
          : (config as any).use_ai_check !== undefined
            ? (config as any).use_ai_check
            : true,
    });

    // Scroll to the form
    document
      .getElementById('configForm')
      ?.scrollIntoView({ behavior: 'smooth' });

    // Set editing state
    setEditingConfig(config);
  };

  const toggleConfig = async (configId: string, isActive: boolean) => {
    setIsLoading(true);
    setError(null);

    // Check subscription limits if trying to activate a bot
    if (isActive) {
      // For free users, check if they have any messages remaining
      if (!isProUser && (remaining === 0 || remaining === null)) {
        setError(
          'You have reached the message limit for the free plan. Please upgrade to Pro for unlimited messages.'
        );
        setIsLoading(false);
        return;
      }

      // For free users, check if they already have an active bot
      if (!isProUser) {
        const activeBotsCount = configs.filter((c) => c.isActive).length;
        if (activeBotsCount >= 1) {
          setError(
            'Free plan allows only 1 active bot. Please upgrade to Pro for unlimited bots.'
          );
          setIsLoading(false);
          return;
        }
      }
    }

    try {
      // Get the config details for logging
      const config = configs.find((c) => c.id === configId);
      if (!config) {
        throw new Error('Configuration not found');
      }

      // Use the API endpoint instead of direct Supabase access
      const response = await fetch('/api/reddit/scan-config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configId,
          isActive,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Server response error:', data);
        throw new Error(data.error || 'Failed to update configuration');
      }

      // Log the bot start/stop action
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Only add account_id header if it's a valid value
      if (config.redditAccountId && config.redditAccountId !== 'undefined') {
        headers['x-account-id'] = config.redditAccountId;
      }

      const logResponse = await fetch('/api/reddit/bot-logs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: isActive ? 'start_bot' : 'stop_bot',
          status: 'success',
          subreddit: config.subreddit,
          config_id: configId, // Add config_id to identify the specific bot
        }),
      });

      if (!logResponse.ok) {
        console.error('Failed to log bot action');
      }

      // Show success message
      const message = `Bot ${isActive ? 'started' : 'stopped'} successfully for r/${config.subreddit}`;
      console.log(message);

      // Immediately update the local state to reflect the change
      setConfigs((prevConfigs) =>
        prevConfigs.map((c) => (c.id === configId ? { ...c, isActive } : c))
      );

      // Increment refreshTrigger to update logs in real-time
      setRefreshTrigger((prev) => prev + 1);

      // Also refresh the configurations list from the server
      await loadConfigs();

      // If the bot was just started, trigger an immediate scan
      if (isActive) {
        console.log(
          `Triggering immediate scan for bot ${configId} in r/${config.subreddit}`
        );
        try {
          // Wait a longer delay to ensure the database has been updated
          console.log(`Waiting for database to update before scanning...`);
          await new Promise((resolve) => setTimeout(resolve, 5000));

          // Verify the config exists in the database before scanning
          console.log(`Verifying config exists with ID: ${configId}`);
          const verifyConfigResponse = await fetch(
            `/api/reddit/scan-config?id=${configId}`
          );

          if (!verifyConfigResponse.ok) {
            console.error(
              `Config verification failed with status: ${verifyConfigResponse.status}`
            );
            setError(
              `Failed to verify configuration before scanning. Please try again.`
            );
            return;
          }

          const verifyConfigData = await verifyConfigResponse.json();
          console.log(`Verify config response:`, verifyConfigData);

          if (!verifyConfigData) {
            console.error(
              `Config verification returned no data for ID: ${configId}`
            );
            setError(
              `Failed to verify configuration before scanning. No data found.`
            );
            return;
          }

          // Double check by making a direct database query
          console.log(`Double checking config in database for ID: ${configId}`);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Small delay for consistency

          // Make a second verification request to be absolutely sure
          const secondVerifyResponse = await fetch(
            `/api/reddit/scan-config?id=${configId}`
          );
          const secondVerifyData = await secondVerifyResponse.json();

          if (!secondVerifyResponse.ok || !secondVerifyData) {
            console.error(`Second verification failed for ID: ${configId}`);
            setError(
              `Failed to verify configuration before scanning. Please try again.`
            );
            return;
          }

          console.log(
            `Verified config exists twice, proceeding with scan for ${configId}`
          );

          // Call the scan API endpoint directly with the exact same ID and force direct query
          const scanResponse = await fetch('/api/reddit/scan-start', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              configId: configId, // Ensure we're using the exact same ID
              forceDirectQuery: true, // Force a direct query to bypass normal flow
            }),
          });

          // Log the scan response for debugging
          console.log(`Scan API response status: ${scanResponse.status}`);

          let responseData;
          try {
            // Try to parse as JSON first
            responseData = await scanResponse.json();
            console.log(`Scan API response data:`, responseData);
          } catch (jsonError) {
            // If it's not valid JSON, get the text
            const responseClone = scanResponse.clone();
            const responseText = await responseClone.text();
            console.log(`Scan API raw response: ${responseText}`);
            responseData = { error: responseText };
          }

          if (!scanResponse.ok) {
            const errorMessage =
              responseData?.error || 'Unknown error occurred';
            console.error(`Failed to scan subreddit: ${errorMessage}`);

            // Log the error to the bot logs
            await fetch('/api/reddit/bot-logs', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'scan_error',
                status: 'error',
                subreddit: config.subreddit,
                config_id: configId,
                message: `Error scanning r/${config.subreddit}: ${errorMessage}`,
              }),
            });

            // Show a toast or notification to the user
            setError(`Failed to scan r/${config.subreddit}: ${errorMessage}`);
          } else {
            console.log(
              `Successfully triggered scan for r/${config.subreddit}`
            );

            // Log the scan manually to ensure we have a record
            await fetch('/api/reddit/bot-logs', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'scan_subreddit',
                status: 'success',
                subreddit: config.subreddit,
                config_id: configId,
                message: `Automatically triggered scan of r/${config.subreddit} after bot start`,
              }),
            });
          }
        } catch (scanError) {
          console.error('Error triggering scan:', scanError);
          setError(
            `Error triggering scan: ${scanError instanceof Error ? scanError.message : 'Unknown error'}`
          );
        }
      }
    } catch (err) {
      console.error('Error toggling config:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to update configuration'
      );

      // Try to log the error
      try {
        const config = configs.find((c) => c.id === configId);
        if (config) {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          // Only add account_id header if it's a valid value
          if (
            config.redditAccountId &&
            config.redditAccountId !== 'undefined'
          ) {
            headers['x-account-id'] = config.redditAccountId;
          }

          await fetch('/api/reddit/bot-logs', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              action: isActive ? 'start_bot' : 'stop_bot',
              status: 'failed',
              subreddit: config.subreddit,
              config_id: configId, // Add config_id to identify the specific bot
            }),
          });
        }
      } catch (logErr) {
        console.error('Failed to log error:', logErr);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Show upgrade prompt for free users */}
      <UpgradePrompt showDetails={true} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-200">
            Subreddit
          </label>
          <input
            type="text"
            value={newConfig.subreddit}
            onChange={(e) =>
              setNewConfig({ ...newConfig, subreddit: e.target.value })
            }
            className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 placeholder-gray-400"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200">
            Keywords
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 placeholder-gray-400"
            />
            <Button
              type="button"
              variant="primary"
              size="medium"
              onClick={handleAddKeyword}
            >
              Add
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {newConfig.keywords.map((kw, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900 text-blue-200"
              >
                {kw}
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(index)}
                  className="ml-1 inline-flex text-blue-300 hover:text-blue-100"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200">
            Reddit Account
          </label>
          <select
            value={newConfig.redditAccountId}
            onChange={(e) =>
              setNewConfig({ ...newConfig, redditAccountId: e.target.value })
            }
            className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 placeholder-gray-400"
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

        <div>
          <label className="block text-sm font-medium text-gray-200">
            Message Template
          </label>
          <select
            value={newConfig.messageTemplateId}
            onChange={(e) =>
              setNewConfig({ ...newConfig, messageTemplateId: e.target.value })
            }
            className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 placeholder-gray-400"
            required
          >
            <option value="" disabled>
              Select a template
            </option>
            {messageTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200">
            Scan Interval (minutes)
          </label>
          <input
            type="number"
            min="10"
            max="300"
            value={newConfig.scanInterval}
            onChange={(e) =>
              setNewConfig({
                ...newConfig,
                scanInterval: parseInt(e.target.value) || 10,
              })
            }
            className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 placeholder-gray-400"
            required
          />
          <p className="mt-1 text-xs text-gray-400">
            Minimum 10 minutes, maximum 300 minutes (5 hours).
          </p>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="useAiCheck"
            checked={newConfig.useAiCheck}
            onChange={(e) =>
              setNewConfig({
                ...newConfig,
                useAiCheck: e.target.checked,
              })
            }
            className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
          />
          <label
            htmlFor="useAiCheck"
            className="ml-2 block text-sm font-medium text-gray-200"
          >
            Use AI to check post relevance (recommended)
          </label>
          <div className="ml-2 group relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 text-gray-400"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM10 4a1 1 0 100 2 1 1 0 000-2zm-1 4a1 1 0 112 0v6a1 1 0 11-2 0v-6z"
                clipRule="evenodd"
              />
            </svg>
            <div className="absolute z-10 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded p-2 max-w-xs -right-4 -top-2 transform -translate-y-full">
              When enabled, the bot will use AI to analyze posts for relevance
              before sending messages, even when keywords match. This helps
              avoid sending messages to irrelevant posts, improving your
              response rate.
            </div>
          </div>
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <RippleButton
          type="submit"
          variant="primary"
          size="medium"
          disabled={isLoading}
          fullWidth
        >
          {isLoading
            ? 'Saving...'
            : editingConfig
              ? 'Save Changes'
              : 'Create Configuration'}
        </RippleButton>
      </form>

      <div className="mt-8">
        <h3 className="text-lg font-medium text-white">
          Active Configurations
        </h3>
        <div className="mt-4 space-y-6">
          {configs.map((config) => (
            <div key={config.id} className="space-y-2">
              <div className="border border-gray-700 bg-gray-800/50 rounded-lg p-4 flex items-center justify-between hover:border-indigo-500/30 transition-colors duration-200">
                <div>
                  <h4 className="font-medium text-white">
                    r/{config.subreddit}
                  </h4>
                  <p className="text-sm text-gray-400">
                    Keywords: {config.keywords.join(', ')}
                  </p>
                  <p className="text-sm text-gray-400">
                    Scan interval:{' '}
                    {config.scanInterval || (config as any).scan_interval || 10} minutes
                  </p>
                  <p className="text-sm text-gray-400">
                    AI relevance check:{' '}
                    {
                      // Check both property formats for maximum compatibility
                      (
                        config.useAiCheck !== undefined
                          ? config.useAiCheck
                          : config.use_ai_check
                      )
                        ? 'Enabled'
                        : 'Disabled'
                    }
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button3D
                    onClick={() =>
                      config.id && toggleConfig(config.id, !config.isActive)
                    }
                    variant={config.isActive ? 'danger' : 'success'}
                    size="medium"
                    className="px-4 py-2 font-medium"
                  >
                    {config.isActive ? 'Stop Bot' : 'Start Bot'}
                  </Button3D>

                  <Button3D
                    onClick={() => config.id && editConfig(config)}
                    variant="secondary"
                    size="medium"
                    className="px-4 py-2 font-medium"
                  >
                    Edit
                  </Button3D>

                  <Button3D
                    onClick={() => config.id && deleteConfig(config.id)}
                    variant="danger"
                    size="medium"
                    className="px-4 py-2 font-medium"
                  >
                    Delete
                  </Button3D>
                </div>
              </div>

              {/* Show BotStatusDisplay for active bots */}
              {config.isActive && config.id && (
                <BotStatusDisplay
                  configId={config.id}
                  subreddit={config.subreddit}
                  keywords={config.keywords}
                  scanInterval={config.scanInterval}
                  refreshTrigger={refreshTrigger}
                  onStopBot={(configId) => toggleConfig(configId, false)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bot Logs Section */}
      <div className="mt-12">
        <h3 className="text-lg font-medium text-white mb-4">
          Bot Activity Logs
        </h3>
        {userId && (
          <LogViewer
            userId={userId}
            refreshTrigger={refreshTrigger}
            onStopBot={(subreddit) => {
              // Find the active config for this subreddit
              const activeConfig = configs.find(
                (config) => config.subreddit === subreddit && config.isActive
              );

              // Toggle the bot off if found
              if (activeConfig?.id) {
                toggleConfig(activeConfig.id, false);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
