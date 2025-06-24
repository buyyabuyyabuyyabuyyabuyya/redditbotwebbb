'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { Tab } from '@headlessui/react';
import { createClientSupabaseClient } from '../utils/supabase';
import { useUserPlan } from '../hooks/useUserPlan';
import SubredditScanner from './SubredditScanner';
import AddRedditAccount from './AddRedditAccount';
import CreateMessageTemplate from './CreateMessageTemplate';
import ScanConfig from './ScanConfig';
import LogViewer from './LogViewer';
import UserStats from './UserStats';
import AutoScanPoller from './AutoScanPoller';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import { Dialog } from '@headlessui/react';

const supabase = createClientSupabaseClient();

interface RedditAccount {
  id: string;
  username: string;
  password: string;
  isValid: boolean | null;
}

interface MessageTemplate {
  id: string;
  name: string;
  content: string;
}

export default function Dashboard() {
  const { user } = useUser();
  const [accounts, setAccounts] = useState<RedditAccount[]>([]);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>(
    []
  );
  const [messageCount, setMessageCount] = useState(0);
  const [selectedSubreddits, setSelectedSubreddits] = useState<string[]>([]);
  const [delayTime, setDelayTime] = useState(60);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [botCount, setBotCount] = useState(1);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [showEditTemplate, setShowEditTemplate] = useState(false);
  const [templateToEdit, setTemplateToEdit] = useState<MessageTemplate | null>(
    null
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string>('');
  // Add a refreshTrigger state to force stats refresh
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  // State to track active bots for AutoScanPoller
  const [activeBots, setActiveBots] = useState<
    Array<{ configId: string; scanInterval: number }>
  >([]);

  // Function to handle stopping a bot from the logs view
  const handleStopBot = async (subreddit: string, configId?: string) => {
    try {
      console.log(
        'Stopping bot for subreddit:',
        subreddit,
        'configId:',
        configId
      );

      // If we don't have a configId, we need to find it first
      if (!configId) {
        console.log(
          'No configId provided, finding active config for subreddit:',
          subreddit
        );
        const response = await fetch('/api/reddit/scan-config');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load configurations');
        }

        // Find the active config for this subreddit
        const activeConfig = data.configs?.find(
          (config: any) => config.subreddit === subreddit && config.is_active
        );

        if (activeConfig) {
          configId = activeConfig.id;
          console.log('Found config ID:', configId);
        } else {
          console.error(
            'No active configuration found for subreddit:',
            subreddit
          );
          throw new Error('No active configuration found for this subreddit');
        }
      }

      // Call the dedicated stop-bot API endpoint
      console.log('Calling stop-bot API with configId:', configId);
      const stopResponse = await fetch('/api/reddit/stop-bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configId,
          subreddit,
        }),
      });

      const stopData = await stopResponse.json();

      if (!stopResponse.ok) {
        console.error('Stop bot API error:', stopData);
        throw new Error(stopData.error || 'Failed to stop bot');
      }

      console.log('Stop bot API response:', stopData);

      // Refresh the logs view
      setRefreshTrigger((prev) => prev + 1);

      // Force reload all data to refresh the UI
      await Promise.all([
        loadAccounts(),
        loadMessageTemplates(),
        loadActiveConfigs(),
      ]);

      // Show success message
      console.log('Bot stopped successfully');

      // Reload the page to ensure all UI components are refreshed
      window.location.reload();
    } catch (error) {
      console.error('Error stopping bot:', error);
      // You could add error handling UI here
    }
  };

  const testAccount = async (account: RedditAccount) => {
    try {
      // Here we'll implement the Reddit account validation logic
      // For now, we'll simulate a successful test
      const updatedAccounts = accounts.map((acc) =>
        acc.username === account.username ? { ...acc, isValid: true } : acc
      );
      setAccounts(updatedAccounts);
    } catch (error) {
      console.error('Error testing account:', error);
      const updatedAccounts = accounts.map((acc) =>
        acc.username === account.username ? { ...acc, isValid: false } : acc
      );
      setAccounts(updatedAccounts);
    }
  };

  const handleAddAccount = () => {
    const newAccount: RedditAccount = {
      id: 'temp-' + Date.now(),
      username: '',
      password: '',
      isValid: null,
    };
    setAccounts([...accounts, newAccount]);
  };

  useEffect(() => {
    if (user) {
      loadAccounts();
      loadMessageTemplates();
      loadActiveConfigs();
    }
  }, [user]);

  // Load active scan configurations for AutoScanPoller
  const loadActiveConfigs = async () => {
    try {
      const response = await fetch('/api/reddit/scan-config');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load active configurations');
      }

      // Filter to only active configs and extract needed information
      const activeConfigs = (data.configs || [])
        .filter((config: any) => config.is_active)
        .map((config: any) => ({
          configId: config.id,
          scanInterval: config.scan_interval || 10, // Default to 30 minutes if not specified
        }));

      setActiveBots(activeConfigs);
    } catch (err) {
      console.error('Error loading active configurations:', err);
    }
  };

  const loadMessageTemplates = async () => {
    try {
      // Use the API endpoint instead of direct Supabase queries
      const response = await fetch('/api/reddit/templates');
      const data = await response.json();

      if (!response.ok) {
        console.error(
          'Error loading templates:',
          data.error || 'Unknown error'
        );
        throw new Error(data.error || 'Failed to load templates');
      }

      console.log('Templates loaded successfully:', data.templates);
      setMessageTemplates(data.templates || []);
    } catch (err) {
      console.error('Error loading message templates:', err);
    }
  };

  const handleEditTemplate = (template: MessageTemplate) => {
    setTemplateToEdit(template);
    setShowEditTemplate(true);
  };

  const confirmDeleteTemplate = (templateId: string) => {
    setTemplateToDelete(templateId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;

    try {
      const response = await fetch(
        `/api/reddit/templates?id=${templateToDelete}`,
        {
          method: 'DELETE',
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(
          'Error deleting template:',
          data.error || 'Unknown error'
        );
        throw new Error(data.error || 'Failed to delete template');
      }

      console.log('Template deleted successfully');
      loadMessageTemplates();
      setDeleteConfirmOpen(false);
      setTemplateToDelete('');
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  };

  const loadAccounts = async () => {
    try {
      // Use the API endpoint instead of direct Supabase calls
      // This bypasses RLS by using the admin client on the server
      const response = await fetch('/api/reddit/account');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load accounts');
      }

      setAccounts(data.accounts || []);
    } catch (err) {
      console.error('Error loading accounts:', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* AutoScanPoller is a headless component that manages automatic scanning */}
      {user &&
        activeBots.map((bot) => (
          <AutoScanPoller
            key={bot.configId}
            configId={bot.configId}
            userId={user.id}
            initialScanInterval={bot.scanInterval}
          />
        ))}
      <div className="bg-gray-900 shadow-xl rounded-lg p-6 text-gray-100">
        <h1 className="text-2xl font-bold mb-6">Reddit Bot Dashboard</h1>

        {/* Stats Overview */}
        <div className="mb-8">
          <UserStats userId={user?.id || ''} refreshTrigger={refreshTrigger} />
        </div>

        <Tab.Group>
          <Tab.List className="flex space-x-1 rounded-xl bg-gray-800 p-1 mb-6">
            <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gray-300 ring-gray-700 ring-opacity-60 ring-offset-2 ring-offset-blue-500 focus:outline-none focus:ring-2 ui-selected:bg-blue-600 ui-selected:shadow-lg ui-selected:text-white ui-not-selected:text-gray-400 ui-not-selected:hover:bg-gray-700 ui-not-selected:hover:text-white transition-all">
              Accounts
            </Tab>
            <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gray-300 ring-gray-700 ring-opacity-60 ring-offset-2 ring-offset-blue-500 focus:outline-none focus:ring-2 ui-selected:bg-blue-600 ui-selected:shadow-lg ui-selected:text-white ui-not-selected:text-gray-400 ui-not-selected:hover:bg-gray-700 ui-not-selected:hover:text-white transition-all">
              Templates
            </Tab>
            <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gray-300 ring-gray-700 ring-opacity-60 ring-offset-2 ring-offset-blue-500 focus:outline-none focus:ring-2 ui-selected:bg-blue-600 ui-selected:shadow-lg ui-selected:text-white ui-not-selected:text-gray-400 ui-not-selected:hover:bg-gray-700 ui-not-selected:hover:text-white transition-all">
              Logs
            </Tab>
            <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gray-300 ring-gray-700 ring-opacity-60 ring-offset-2 ring-offset-blue-500 focus:outline-none focus:ring-2 ui-selected:bg-blue-600 ui-selected:shadow-lg ui-selected:text-white ui-not-selected:text-gray-400 ui-not-selected:hover:bg-gray-700 ui-not-selected:hover:text-white transition-all">
              Subreddits
            </Tab>
          </Tab.List>

          <Tab.Panels className="mt-6">
            <Dialog
              open={showAddAccount}
              onClose={() => setShowAddAccount(false)}
              className="relative z-50"
            >
              <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
              <div className="fixed inset-0 flex items-center justify-center p-4">
                <Dialog.Panel className="mx-auto max-w-lg rounded bg-gray-800 border border-gray-700 p-6">
                  <AddRedditAccount
                    userId={user?.id || ''}
                    onSuccess={() => {
                      setShowAddAccount(false);
                      loadAccounts();
                      // Refresh stats when a new account is added
                      setRefreshTrigger((prev) => prev + 1);
                    }}
                  />
                </Dialog.Panel>
              </div>
            </Dialog>

            <Dialog
              open={showCreateTemplate}
              onClose={() => setShowCreateTemplate(false)}
              className="relative z-50"
            >
              <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
              <div className="fixed inset-0 flex items-center justify-center p-4">
                <Dialog.Panel className="mx-auto max-w-lg rounded bg-gray-800 border border-gray-700 p-6">
                  <CreateMessageTemplate
                    userId={user?.id || ''}
                    onSuccess={() => {
                      setShowCreateTemplate(false);
                      loadMessageTemplates();
                      // Refresh stats when a new template is created
                      setRefreshTrigger((prev) => prev + 1);
                    }}
                  />
                </Dialog.Panel>
              </div>
            </Dialog>

            {/* Edit Template Dialog */}
            <Dialog
              open={showEditTemplate}
              onClose={() => setShowEditTemplate(false)}
              className="relative z-50"
            >
              <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
              <div className="fixed inset-0 flex items-center justify-center p-4">
                <Dialog.Panel className="mx-auto max-w-lg rounded bg-gray-800 border border-gray-700 p-6">
                  {templateToEdit && (
                    <CreateMessageTemplate
                      userId={user?.id || ''}
                      existingTemplate={templateToEdit}
                      onSuccess={() => {
                        setShowEditTemplate(false);
                        setTemplateToEdit(null);
                        loadMessageTemplates();
                      }}
                    />
                  )}
                </Dialog.Panel>
              </div>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
              open={deleteConfirmOpen}
              onClose={() => setDeleteConfirmOpen(false)}
              className="relative z-50"
            >
              <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
              <div className="fixed inset-0 flex items-center justify-center p-4">
                <Dialog.Panel className="mx-auto max-w-md rounded-lg bg-gray-800 border border-gray-700 p-6 shadow-xl">
                  <Dialog.Title className="text-lg font-medium text-white mb-4">
                    Delete Template
                  </Dialog.Title>
                  <p className="text-gray-300 mb-6">
                    Are you sure you want to delete this template? This action
                    cannot be undone.
                  </p>
                  <div className="flex justify-end space-x-4">
                    <button
                      onClick={() => setDeleteConfirmOpen(false)}
                      className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteTemplate}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-all shadow-md hover:shadow-lg"
                    >
                      Delete
                    </button>
                  </div>
                </Dialog.Panel>
              </div>
            </Dialog>

            <Tab.Panel>
              <div className="space-y-4">
                <div className="rounded-lg bg-gray-800/50 shadow-lg border border-gray-700/50 backdrop-blur-sm">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-semibold">Reddit Accounts</h2>
                      <button
                        onClick={() => setShowAddAccount(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all hover:shadow-lg font-medium"
                      >
                        Add Account
                      </button>
                    </div>

                    {accounts.map((account, index) => (
                      <div
                        key={index}
                        className="flex items-center space-x-4 p-4 border border-gray-700/50 rounded-lg bg-gray-800/30 backdrop-blur-sm mb-4 hover:bg-gray-800/50 transition-colors"
                      >
                        <div className="flex-1 space-x-4 flex items-center">
                          <input
                            type="text"
                            placeholder="Username"
                            value={account.username}
                            onChange={(e) => {
                              const newAccounts = [...accounts];
                              newAccounts[index].username = e.target.value;
                              setAccounts(newAccounts);
                            }}
                            className="flex-1 p-2 border border-gray-600/50 rounded-lg bg-gray-900/50 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                          />
                          <input
                            type="password"
                            placeholder="Password"
                            value={account.password}
                            onChange={(e) => {
                              const newAccounts = [...accounts];
                              newAccounts[index].password = e.target.value;
                              setAccounts(newAccounts);
                            }}
                            className="flex-1 p-2 border border-gray-600/50 rounded-lg bg-gray-900/50 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                          />
                          <button
                            onClick={() => testAccount(account)}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-all hover:shadow-lg font-medium"
                          >
                            Test
                          </button>
                        </div>
                        <div className="flex items-center">
                          {account.isValid === true && (
                            <CheckCircleIcon className="h-6 w-6 text-green-500" />
                          )}
                          {account.isValid === false && (
                            <XCircleIcon className="h-6 w-6 text-red-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Tab.Panel>

            <Tab.Panel>
              <div className="space-y-6">
                <div className="rounded-lg bg-gray-800/50 shadow-lg border border-gray-700/50 backdrop-blur-sm p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold">Message Templates</h2>
                    <button
                      onClick={() => setShowCreateTemplate(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all hover:shadow-lg font-medium"
                    >
                      Create Template
                    </button>
                  </div>

                  {messageTemplates.length > 0 ? (
                    <div className="space-y-4">
                      {messageTemplates.map((template) => (
                        <div
                          key={template.id}
                          className="p-4 border border-gray-700/50 rounded-lg bg-gray-800/30 backdrop-blur-sm hover:bg-gray-800/50 transition-colors"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="text-lg font-medium text-purple-300">
                              {template.name}
                            </h3>
                            <div className="flex space-x-2">
                              {/* Edit Button */}
                              <button
                                onClick={() => handleEditTemplate(template)}
                                className="relative inline-flex items-center justify-center p-0.5 mb-2 me-2 overflow-hidden text-sm font-medium rounded-lg group bg-gradient-to-br from-purple-500 to-blue-500 text-white focus:ring-4 focus:outline-none focus:ring-blue-800"
                              >
                                <span className="relative px-3 py-1.5 transition-all ease-in duration-75 bg-gray-900 rounded-md group-hover:bg-opacity-0">
                                  <svg
                                    className="w-4 h-4 inline-block mr-1"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    ></path>
                                  </svg>
                                  Edit
                                </span>
                              </button>

                              {/* Delete Button */}
                              <button
                                onClick={() =>
                                  confirmDeleteTemplate(template.id)
                                }
                                className="relative inline-flex items-center justify-center p-0.5 mb-2 me-2 overflow-hidden text-sm font-medium rounded-lg group bg-gradient-to-br from-pink-500 to-red-500 text-white focus:ring-4 focus:outline-none focus:ring-red-800"
                              >
                                <span className="relative px-3 py-1.5 transition-all ease-in duration-75 bg-gray-900 rounded-md group-hover:bg-opacity-0">
                                  <svg
                                    className="w-4 h-4 inline-block mr-1"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    ></path>
                                  </svg>
                                  Delete
                                </span>
                              </button>
                            </div>
                          </div>
                          <p className="mt-2 text-gray-300 text-sm whitespace-pre-line">
                            {template.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-400">
                        No message templates yet. Create your first template to
                        get started.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Tab.Panel>

            <Tab.Panel>
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Bot Logs</h2>
                <LogViewer
                  userId={user?.id || ''}
                  refreshTrigger={refreshTrigger}
                  onStopBot={handleStopBot}
                />
              </div>
            </Tab.Panel>

            <Tab.Panel>
              <SubredditScanner
                userId={user?.id || ''}
                redditAccounts={accounts}
                messageTemplates={messageTemplates}
              />
            </Tab.Panel>

            <Tab.Panel>
              <ScanConfig
                userId={user?.id || ''}
                onSuccess={() => {
                  // Refresh any necessary data after creating a scan config
                  loadAccounts();
                  loadMessageTemplates();
                  // Refresh stats when a new scan config is created or updated
                  setRefreshTrigger((prev) => prev + 1);
                }}
              />
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </div>
    </div>
  );
}
