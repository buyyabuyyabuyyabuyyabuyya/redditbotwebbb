'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { Tab } from '@headlessui/react';
import { createClientSupabaseClient } from '../utils/supabase';
import { useUserPlan } from '../hooks/useUserPlan';
import SubredditScanner from './SubredditScanner';
import AddRedditAccount from './AddRedditAccount';
import CreateMessageTemplate from './CreateMessageTemplate';

import LogViewer from './LogViewer';
import UserStats from './UserStats';
import AutoScanPoller from './AutoScanPoller';
import { BenoOneWorkflow } from './beno-one';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import { Dialog } from '@headlessui/react';
import { getUserAgentBadgeText } from '../utils/userAgents';

const supabase = createClientSupabaseClient();

interface RedditAccount {
  id: string;
  username: string;
  is_validated: boolean | null;
  status?: string;
  banned_at?: string;
  credential_error_at?: string;
  proxy_enabled?: boolean;
  proxy_status?: string | null;
  proxy_last_checked?: string | null;
  proxy_type?: string | null;
  user_agent_enabled?: boolean;
  user_agent_type?: string | null;
  user_agent_custom?: string | null;
  user_agent_last_checked?: string | null;
}

interface MessageTemplate {
  id: string;
  name: string;
  content: string;
}

export default function Dashboard() {
  const { user } = useUser();
  const { isProUser } = useUserPlan();
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
  const [showEditAccount, setShowEditAccount] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<any>(null);
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
  // Proxy test UI state
  const [proxyTestingId, setProxyTestingId] = useState<string | null>(null);
  const [proxyTestMsg, setProxyTestMsg] = useState<Record<string, string>>({});
  
  // User Agent test UI state
  const [userAgentTestingId, setUserAgentTestingId] = useState<string | null>(null);
  const [userAgentTestMsg, setUserAgentTestMsg] = useState<Record<string, string>>({});
  // Saved campaigns (promoting products)
  const [campaigns, setCampaigns] = useState<any[]>([]);

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

  // ---- Account Edit / Delete Handlers ----
  const handleEditAccount = async (accountId: string) => {
    try {
      const response = await fetch(`/api/reddit/account?id=${accountId}&credentials=true`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load account');
      }
      setAccountToEdit(data.account);
      setShowEditAccount(true);
    } catch (err) {
      console.error('Error loading account:', err);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('Delete this Reddit account?')) return;
    try {
      const response = await fetch(`/api/reddit/account?id=${accountId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete account');
      }
      await loadAccounts();
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      console.error('Error deleting account:', err);
    }
  };





  useEffect(() => {
    if (user) {
      loadAccounts();
      loadMessageTemplates();
      loadActiveConfigs();
      loadCampaigns();
    }
  }, [user]);

  // Listen for newly created campaigns
  useEffect(() => {
    window.addEventListener('campaignsUpdated', loadCampaigns);
    return () => window.removeEventListener('campaignsUpdated', loadCampaigns);
  }, []);

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

  const loadCampaigns = async () => {
    try {
      const response = await fetch('/api/beno/promoting-product');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load campaigns');
      }
      const items = Array.isArray(data.items) ? data.items : (data.items ? data.items : data);
      setCampaigns(items);
    } catch (err) {
      console.error('Error loading campaigns:', err);
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

  const handleTestProxyQuick = async (accountId: string) => {
    try {
      setProxyTestingId(accountId);
      setProxyTestMsg((m) => ({ ...m, [accountId]: '' }));
      const resp = await fetch('/api/proxy/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const data = await resp.json();
      if (resp.ok) {
        const msg = `OK • ${data.latencyMs ?? '?'}ms${data.ip ? ` • IP ${data.ip}` : ''}`;
        setProxyTestMsg((m) => ({ ...m, [accountId]: msg }));
      } else {
        setProxyTestMsg((m) => ({ ...m, [accountId]: `Failed: ${data.error || 'error'}` }));
      }
      // Refresh account row to update status/last-checked
      await loadAccounts();
    } catch (e: any) {
      setProxyTestMsg((m) => ({ ...m, [accountId]: `Failed: ${e?.message || String(e)}` }));
    } finally {
      setProxyTestingId(null);
      // Auto-clear the message after a few seconds
      setTimeout(() => setProxyTestMsg((m) => ({ ...m, [accountId]: '' })), 5000);
    }
  };

  const handleTestUserAgentQuick = async (accountId: string) => {
    try {
      setUserAgentTestingId(accountId);
      setUserAgentTestMsg((m) => ({ ...m, [accountId]: '' }));
      const resp = await fetch('/api/reddit/test-user-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const data = await resp.json();
      if (resp.ok) {
        const msg = `✅ ${data.browser || 'Valid'}`;
        setUserAgentTestMsg((m) => ({ ...m, [accountId]: msg }));
      } else {
        setUserAgentTestMsg((m) => ({ ...m, [accountId]: `❌ ${data.error || 'Failed'}` }));
      }
      // Refresh account row to update status/last-checked
      await loadAccounts();
    } catch (e: any) {
      setUserAgentTestMsg((m) => ({ ...m, [accountId]: `❌ ${e?.message || 'Error'}` }));
    } finally {
      setUserAgentTestingId(null);
      // Auto-clear the message after a few seconds
      setTimeout(() => setUserAgentTestMsg((m) => ({ ...m, [accountId]: '' })), 5000);
    }
  };

  const handleWebsiteAnalysis = async (url: string) => {
    try {
      // Trigger the Beno One workflow
      const event = new CustomEvent('startBenoWorkflow', { detail: { url } });
      window.dispatchEvent(event);
    } catch (e: any) {
      console.error('Error starting website analysis:', e);
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
            <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gray-300 ring-gray-700 ring-opacity-60 ring-offset-2 ring-offset-blue-500 focus:outline-none focus:ring-2 ui-selected:bg-blue-600 ui-selected:shadow-lg ui-selected:text-white ui-not-selected:text-gray-400 ui-not-selected:hover:bg-gray-700 ui-not-selected:hover:text-white transition-all">
              Discussion Engagement
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
                <Dialog.Panel className="mx-auto w-full max-w-2xl max-h-[90vh] rounded bg-gray-800 border border-gray-700 overflow-hidden">
                  {/* Header with close button */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-lg font-medium text-white">
                      Add Reddit Account
                    </h3>
                    <button
                      onClick={() => setShowAddAccount(false)}
                      className="text-gray-400 hover:text-white transition-colors p-1"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Scrollable content */}
                  <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
                    <AddRedditAccount
                      userId={user?.id || ''}
                      onSuccess={() => {
                        setShowAddAccount(false);
                        loadAccounts();
                        // Refresh stats when a new account is added
                        setRefreshTrigger((prev) => prev + 1);
                      }}
                    />
                  </div>
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
                <Dialog.Panel className="mx-auto w-full max-w-2xl max-h-[90vh] rounded bg-gray-800 border border-gray-700 overflow-hidden">
                  {/* Header with close button */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-lg font-medium text-white">
                      Create Message Template
                    </h3>
                    <button
                      onClick={() => setShowCreateTemplate(false)}
                      className="text-gray-400 hover:text-white transition-colors p-1"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Scrollable content */}
                  <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
                    <CreateMessageTemplate
                      userId={user?.id || ''}
                      onSuccess={() => {
                        setShowCreateTemplate(false);
                        loadMessageTemplates();
                        // Refresh stats when a new template is created
                        setRefreshTrigger((prev) => prev + 1);
                      }}
                    />
                  </div>
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
                <Dialog.Panel className="mx-auto w-full max-w-2xl max-h-[90vh] rounded bg-gray-800 border border-gray-700 overflow-hidden">
                  {/* Header with close button */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-lg font-medium text-white">
                      Edit Message Template
                    </h3>
                    <button
                      onClick={() => setShowEditTemplate(false)}
                      className="text-gray-400 hover:text-white transition-colors p-1"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Scrollable content */}
                  <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
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
                  </div>
                </Dialog.Panel>
              </div>
            </Dialog>

            {/* Edit Account Dialog */}
            <Dialog
              open={showEditAccount}
              onClose={() => setShowEditAccount(false)}
              className="relative z-50"
            >
              <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
              <div className="fixed inset-0 flex items-center justify-center p-4">
                <Dialog.Panel className="mx-auto w-full max-w-2xl max-h-[90vh] rounded bg-gray-800 border border-gray-700 overflow-hidden">
                  {/* Header with close button */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-lg font-medium text-white">
                      Edit Reddit Account
                    </h3>
                    <button
                      onClick={() => setShowEditAccount(false)}
                      className="text-gray-400 hover:text-white transition-colors p-1"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Scrollable content */}
                  <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
                    {accountToEdit && (
                      <AddRedditAccount
                        userId={user?.id || ''}
                        account={accountToEdit}
                        onSuccess={() => {
                          setShowEditAccount(false);
                          loadAccounts();
                          setRefreshTrigger((prev) => prev + 1);
                        }}
                      />
                    )}
                  </div>
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

                    {accounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between p-4 border border-gray-700/50 rounded-lg bg-gray-800/30 backdrop-blur-sm mb-4 hover:bg-gray-800/50 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <span className={`font-medium ${
                            account.status === 'banned' ? 'text-red-400 line-through' : 
                            account.status === 'credential_error' ? 'text-orange-400' : 'text-white'
                          }`}>
                            {account.username}
                          </span>
                          {/* Proxy badge with status and last-checked */}
                          {isProUser && (account as any)?.proxy_enabled && (
                            <button
                              onClick={() => handleTestProxyQuick(account.id)}
                              disabled={proxyTestingId === account.id}
                              title={`Click to test via proxy\nStatus: ${account.proxy_status || 'unknown'}${account.proxy_last_checked ? ` • Checked ${new Date(account.proxy_last_checked).toLocaleString()}` : ''}${account.proxy_type ? ` • ${account.proxy_type.toUpperCase()}` : ''}`}
                              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                                account.proxy_status === 'ok'
                                  ? 'bg-emerald-700/60 text-emerald-200 border-emerald-600/50 hover:bg-emerald-700'
                                  : account.proxy_status === 'error'
                                  ? 'bg-red-700/60 text-red-200 border-red-600/50 hover:bg-red-700'
                                  : 'bg-gray-700/60 text-gray-200 border-gray-600/50 hover:bg-gray-700'
                              } ${proxyTestingId === account.id ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                            >
                              {proxyTestingId === account.id ? 'TESTING…' : 'PROXY'}
                            </button>
                          )}
                          {!!proxyTestMsg[account.id] && (
                            <span className="ml-2 text-xs text-gray-300">{proxyTestMsg[account.id]}</span>
                          )}
                          
                          {/* User Agent badge */}
                          {(account as any)?.user_agent_enabled && (
                            <button
                              onClick={() => handleTestUserAgentQuick(account.id)}
                              disabled={userAgentTestingId === account.id}
                              title={`Click to test User Agent\nType: ${(account as any)?.user_agent_type || 'default'}${(account as any)?.user_agent_last_checked ? ` • Checked ${new Date((account as any).user_agent_last_checked).toLocaleString()}` : ''}`}
                              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                                'bg-purple-700/60 text-purple-200 border-purple-600/50 hover:bg-purple-700'
                              } ${userAgentTestingId === account.id ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                            >
                              {userAgentTestingId === account.id ? 'TESTING…' : 
                                getUserAgentBadgeText((account as any)?.user_agent_type || 'default')
                              }
                            </button>
                          )}
                          {!!userAgentTestMsg[account.id] && (
                            <span className="ml-2 text-xs text-gray-300">{userAgentTestMsg[account.id]}</span>
                          )}
                          {account.status === 'banned' ? (
                            <div className="flex items-center space-x-1">
                              <XCircleIcon className="h-5 w-5 text-red-500" />
                              <span className="text-xs text-red-400">BANNED</span>
                            </div>
                          ) : account.status === 'credential_error' ? (
                            <div className="flex items-center space-x-1">
                              <XCircleIcon className="h-5 w-5 text-orange-500" />
                              <span className="text-xs text-orange-400">INVALID CREDENTIALS</span>
                            </div>
                          ) : account.is_validated ? (
                            <CheckCircleIcon className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircleIcon className="h-5 w-5 text-yellow-500" />
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleEditAccount(account.id)}
                            className="px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-all text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteAccount(account.id)}
                            className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-500 transition-all text-sm"
                          >
                            Delete
                          </button>
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
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">Discussion Engagement</h2>
                  <div className="text-sm text-gray-400">
                    AI-powered Reddit discussion monitoring and engagement
                  </div>
                </div>
                

                {/* Saved Campaigns */}
                {campaigns.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-lg font-medium text-purple-300 mb-4">Your Campaigns</h3>
                    <div className="space-y-4">
                      {campaigns.map((c: any) => (
                        <div
                          key={c.id}
                          className="p-4 border border-gray-700/50 rounded-lg bg-gray-800/40 flex justify-between items-center hover:bg-gray-800/60 transition-colors"
                        >
                          <div>
                            <h4 className="text-white font-semibold">{c.name}</h4>
                            <p className="text-sm text-gray-400">{c.url}</p>
                          </div>
                          <button
                            onClick={() => console.log('View campaign details', c.id)}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-all"
                          >
                            See Details
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step-by-step Beno Workflow */}
                <BenoOneWorkflow />
              </div>
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </div>
    </div>
  );
}