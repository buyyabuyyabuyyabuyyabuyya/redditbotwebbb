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
      if (!selectedConfigId && data.configs?.length)
        setSelectedConfigId(data.configs[0].id);
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
    if (activeTab === 'history')
      void loadPostingHistory(selectedConfigId || undefined);
  }, [activeTab, selectedConfigId, loadPostingHistory]);

  useEffect(() => {
    const refreshHistory = () => {
      if (activeTab === 'history')
        void loadPostingHistory(selectedConfigId || undefined);
    };
    window.addEventListener('posted-discussions:updated', refreshHistory);
    return () =>
      window.removeEventListener('posted-discussions:updated', refreshHistory);
  }, [activeTab, selectedConfigId, loadPostingHistory]);

  if (!isLoaded)
    return (
      <div className="flex h-64 items-center justify-center text-zinc-500">
        Loading…
      </div>
    );
  if (!user)
    return (
      <div className="p-8 text-center text-zinc-500">
        Please sign in to access the comment workspace.
      </div>
    );

  const tabs = [
    { id: 'autoposter', label: 'Auto-Poster', icon: '🤖' },
    { id: 'config', label: 'Website Configs', icon: '⚙️' },
    { id: 'history', label: 'Posted Comments', icon: '📝' },
  ] as const;

  return (
    <div className="py-12">
      <div className="section-shell space-y-8">
        <section className="surface-card p-8">
          <p className="page-kicker">Discussion poster</p>
          <h1 className="page-title mt-3">
            Run comment campaigns from one clean workspace
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-500">
            Set your website targeting, choose exact subreddits, run the
            auto-poster, and review every posted comment in one place.
          </p>
        </section>

        {accountStatus && (
          <section className="surface-card p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center">
                  <div
                    className={`mr-2 h-2.5 w-2.5 rounded-full ${accountStatus.accounts?.length > 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                  />
                  <span className="text-sm font-medium text-zinc-800">
                    {accountStatus.accounts?.length || 0} Reddit account
                    {accountStatus.accounts?.length === 1 ? '' : 's'} available
                  </span>
                </div>
                {accountStatus.estimatedWaitMinutes ? (
                  <span className="text-sm text-amber-500">
                    Next available in {accountStatus.estimatedWaitMinutes}m
                  </span>
                ) : null}
              </div>
              <button
                onClick={() => void loadAccountStatus()}
                className="text-sm text-zinc-500 hover:text-zinc-950"
              >
                Refresh
              </button>
            </div>
          </section>
        )}

        <section className="surface-card overflow-hidden">
          <div className="border-b border-black/8 px-6">
            <nav className="-mb-px flex flex-wrap gap-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`border-b-2 px-1 py-4 text-sm font-medium ${activeTab === tab.id ? 'border-zinc-950 text-zinc-950' : 'border-transparent text-zinc-500 hover:border-black/10 hover:text-zinc-900'}`}
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
                    <h3 className="text-lg font-medium text-zinc-950">
                      Posted comments
                    </h3>
                    <p className="text-sm text-zinc-500">
                      Review every comment your auto-poster has published.
                    </p>
                  </div>
                  <select
                    value={selectedConfigId}
                    onChange={(e) => setSelectedConfigId(e.target.value)}
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-950 md:max-w-md"
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
                  <div className="surface-subtle p-6 text-sm text-zinc-500">
                    Create a website configuration first so the auto-poster
                    knows what to target.
                  </div>
                ) : postingHistory.length === 0 ? (
                  <div className="surface-subtle p-6 text-sm text-zinc-500">
                    No posted comments yet for{' '}
                    {selectedConfig
                      ? selectedConfig.website_url || selectedConfig.url
                      : 'this workspace'}
                    .
                  </div>
                ) : (
                  <div className="space-y-3">
                    {postingHistory.map((post) => (
                      <div key={post.id} className="surface-subtle p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-zinc-950">
                              {post.post_title}
                            </h4>
                            <p className="mt-1 text-sm text-zinc-500">
                              r/{post.subreddit}
                            </p>
                            <p className="mt-3 text-sm leading-6 text-zinc-600">
                              {post.comment_posted}
                            </p>
                            {post.comment_url ? (
                              <a
                                href={post.comment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 inline-block text-sm font-medium text-zinc-950 underline-offset-4 hover:underline"
                              >
                                View comment on Reddit ↗
                              </a>
                            ) : null}
                          </div>
                          <div className="text-sm text-zinc-500">
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
        </section>
      </div>
    </div>
  );
}
