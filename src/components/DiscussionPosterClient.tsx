'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import AutoPosterManager from './AutoPosterManager';
import WebsiteConfigManagerStepByStep from './WebsiteConfigManagerStepByStep';
import { WebsiteConfig } from '../lib/relevanceFiltering';

interface AccountStatus {
  accounts: any[];
  estimatedWaitMinutes?: number;
}

interface PostingHistory {
  id: string;
  post_title: string;
  subreddit: string;
  comment_posted: string;
  created_at: string;
  comment_url?: string | null;
}

export default function DiscussionPosterClient() {
  const { user, isLoaded } = useUser();
  const [activeTab, setActiveTab] = useState<
    'autoposter' | 'config' | 'history'
  >('autoposter');
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [websiteConfigs, setWebsiteConfigs] = useState<WebsiteConfig[]>([]);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(
    null
  );
  const [postingHistory, setPostingHistory] = useState<PostingHistory[]>([]);

  const selectedConfig = useMemo(
    () =>
      websiteConfigs.find((config) => config.id === selectedConfigId) || null,
    [selectedConfigId, websiteConfigs]
  );

  const loadWebsiteConfigs = useCallback(async () => {
    const response = await fetch('/api/website-config');
    const data = await response.json();
    if (response.ok) {
      setWebsiteConfigs(data.configs || []);
      if (!selectedConfigId && data.configs?.length) {
        setSelectedConfigId(data.configs[0].id);
      }
    }
  }, [selectedConfigId]);

  const loadAccountStatus = useCallback(async () => {
    const response = await fetch(
      '/api/reddit/accounts/available?action=status'
    );
    const data = await response.json();
    if (response.ok) setAccountStatus(data);
  }, []);

  const loadPostingHistory = useCallback(async (configId?: string) => {
    const url = new URL('/api/posted-discussions', window.location.origin);
    url.searchParams.set('action', 'list');
    url.searchParams.set('limit', '50');
    if (configId) url.searchParams.set('website_config_id', configId);

    const response = await fetch(url.toString());
    const data = await response.json();
    if (response.ok) setPostingHistory(data.posts || []);
  }, []);

  useEffect(() => {
    if (!isLoaded || !user) return;
    void Promise.all([loadWebsiteConfigs(), loadAccountStatus()]);
  }, [isLoaded, user, loadWebsiteConfigs, loadAccountStatus]);

  useEffect(() => {
    if (activeTab === 'history') {
      void loadPostingHistory(selectedConfigId || undefined);
    }
  }, [activeTab, selectedConfigId, loadPostingHistory]);

  useEffect(() => {
    const refreshHistory = () => {
      if (activeTab === 'history') {
        void loadPostingHistory(selectedConfigId || undefined);
      }
    };

    window.addEventListener('posted-discussions:updated', refreshHistory);
    return () =>
      window.removeEventListener('posted-discussions:updated', refreshHistory);
  }, [activeTab, selectedConfigId, loadPostingHistory]);

  if (!isLoaded) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-center text-gray-300">
        Please sign in to access the comment workspace.
      </div>
    );
  }

  const tabs = [
    { id: 'autoposter', label: 'Auto-Poster', icon: '🤖' },
    { id: 'config', label: 'Website Configs', icon: '⚙️' },
    { id: 'history', label: 'Posted Comments', icon: '📝' },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-950 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-3xl border border-gray-800 bg-black p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
            Discussion Poster
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
            Run comment campaigns from one clean workspace
          </h1>
          <p className="mt-3 max-w-3xl text-base text-gray-400">
            Set your website targeting, choose exact subreddits, run the
            auto-poster, and review every posted comment in one place.
          </p>
        </div>

        {accountStatus && (
          <div className="mb-6 rounded-2xl border border-gray-800 bg-black p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center">
                  <div
                    className={`mr-2 h-2.5 w-2.5 rounded-full ${accountStatus.accounts?.length > 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                  />
                  <span className="text-sm font-medium text-gray-200">
                    {accountStatus.accounts?.length || 0} Reddit account
                    {accountStatus.accounts?.length === 1 ? '' : 's'} available
                  </span>
                </div>
                {accountStatus.estimatedWaitMinutes ? (
                  <span className="text-sm text-amber-400">
                    Next available in {accountStatus.estimatedWaitMinutes}m
                  </span>
                ) : null}
              </div>
              <button
                onClick={() => void loadAccountStatus()}
                className="text-sm text-gray-400 hover:text-white"
              >
                Refresh
              </button>
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-gray-800 bg-black shadow-sm">
          <div className="border-b border-gray-800 px-6">
            <nav className="-mb-px flex flex-wrap gap-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`border-b-2 px-1 py-4 text-sm font-medium ${activeTab === tab.id ? 'border-white text-white' : 'border-transparent text-gray-500 hover:border-gray-700 hover:text-gray-200'}`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'autoposter' && (
              <AutoPosterManager
                websiteConfigs={websiteConfigs}
                onRefreshConfigs={() => void loadWebsiteConfigs()}
              />
            )}

            {activeTab === 'config' && (
              <WebsiteConfigManagerStepByStep
                onConfigsChange={() => {
                  void loadWebsiteConfigs();
                  void loadPostingHistory(selectedConfigId || undefined);
                }}
              />
            )}

            {activeTab === 'history' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-white">
                      Posted Comments
                    </h3>
                    <p className="text-sm text-gray-400">
                      Review every comment your auto-poster has published.
                    </p>
                  </div>
                  <select
                    value={selectedConfigId}
                    onChange={(e) => setSelectedConfigId(e.target.value)}
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white md:max-w-md"
                  >
                    <option value="">All website configurations</option>
                    {websiteConfigs.map((config) => (
                      <option key={config.id} value={config.id}>
                        {config.website_url || config.url}
                      </option>
                    ))}
                  </select>
                </div>

                {websiteConfigs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-800 p-6 text-sm text-gray-500">
                    Create a website configuration first so the auto-poster
                    knows what to target.
                  </div>
                ) : postingHistory.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-800 p-6 text-sm text-gray-500">
                    No posted comments yet for{' '}
                    {selectedConfig
                      ? selectedConfig.website_url || selectedConfig.url
                      : 'this workspace'}
                    .
                  </div>
                ) : (
                  <div className="space-y-3">
                    {postingHistory.map((post) => (
                      <div
                        key={post.id}
                        className="rounded-2xl border border-gray-800 bg-gray-950 p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-white">
                              {post.post_title}
                            </h4>
                            <p className="mt-1 text-sm text-gray-500">
                              r/{post.subreddit}
                            </p>
                            <p className="mt-3 text-sm leading-6 text-gray-300">
                              {post.comment_posted}
                            </p>
                            {post.comment_url ? (
                              <a
                                href={post.comment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 inline-block text-sm text-white underline-offset-4 hover:underline"
                              >
                                View Comment on Reddit ↗
                              </a>
                            ) : null}
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(post.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
