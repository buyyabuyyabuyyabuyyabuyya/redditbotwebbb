'use client';

import { useEffect, useMemo, useState } from 'react';
import { WebsiteConfig } from '../lib/relevanceFiltering';

interface AutoPosterStatus {
  isRunning: boolean;
  nextPostTime: Date | null;
  postsToday: number;
  totalPosts: number;
  lastPostTime: string | null;
  lastCommentUrl?: string | null;
  lastPostResult: string | null;
  currentWebsiteConfig: WebsiteConfig | null;
  intervalMinutes: number;
  maxPostsPerDay: number;
  redditAccount: string;
}

interface ActiveAutoPosterConfig {
  id: string;
  websiteConfigId: string;
  isRunning: boolean;
  nextPostTime: string | null;
  lastPostTime: string | null;
  postsToday: number;
  totalPosts: number;
  intervalMinutes: number;
  maxPostsPerDay: number;
  redditAccount: string;
  currentWebsiteConfig: WebsiteConfig | null;
}

interface RecentPost {
  id: string;
  post_title: string;
  subreddit: string;
  comment_posted: string;
  created_at: string;
  comment_url?: string | null;
}

interface AutoPosterManagerProps {
  websiteConfigs: WebsiteConfig[];
  onRefreshConfigs?: () => void;
}

export default function AutoPosterManager({
  websiteConfigs,
  onRefreshConfigs,
}: AutoPosterManagerProps) {
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [status, setStatus] = useState<AutoPosterStatus | null>(null);
  const [activeConfigs, setActiveConfigs] = useState<ActiveAutoPosterConfig[]>(
    []
  );
  const [postingStats, setPostingStats] = useState({
    postsToday: 0,
    totalPosts: 0,
    lastPostTime: null as string | null,
  });
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stoppingConfigId, setStoppingConfigId] = useState<string | null>(null);

  const hasActiveConfigs = activeConfigs.length > 0;

  const fetchActiveConfigs = async () => {
    const response = await fetch('/api/auto-poster/status');
    const data = await response.json();
    if (response.ok) {
      setActiveConfigs(data.configs || []);
      if (!selectedConfigId && data.configs?.length) {
        setSelectedConfigId(data.configs[0].websiteConfigId);
      }
    }
  };

  const fetchStatus = async (configId: string) => {
    const response = await fetch(
      `/api/auto-poster/status?websiteConfigId=${configId}`
    );
    const data = await response.json();
    if (response.ok) {
      setStatus({
        ...data,
        nextPostTime: data.nextPostTime ? new Date(data.nextPostTime) : null,
      });
    }
  };

  const fetchPostingStats = async (configId?: string) => {
    const url = new URL('/api/posted-discussions', window.location.origin);
    url.searchParams.set('action', 'stats');
    if (configId) url.searchParams.set('website_config_id', configId);
    const response = await fetch(url.toString());
    const data = await response.json();
    if (response.ok) {
      setPostingStats({
        postsToday: data.postsToday || 0,
        totalPosts: data.totalPosts || 0,
        lastPostTime: data.lastPostTime || null,
      });
    }
  };

  const fetchRecentPosts = async (configId: string) => {
    const url = new URL('/api/posted-discussions', window.location.origin);
    url.searchParams.set('action', 'list');
    url.searchParams.set('limit', '5');
    url.searchParams.set('website_config_id', configId);
    const response = await fetch(url.toString());
    const data = await response.json();
    if (response.ok) {
      setRecentPosts(data.posts || []);
    }
  };

  const refreshAll = async (configId?: string) => {
    setLoading(true);
    try {
      await Promise.all([
        fetchActiveConfigs(),
        fetchPostingStats(configId || selectedConfigId || undefined),
        configId || selectedConfigId
          ? fetchStatus(configId || selectedConfigId)
          : Promise.resolve(),
        configId || selectedConfigId
          ? fetchRecentPosts(configId || selectedConfigId)
          : Promise.resolve(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (!selectedConfigId) return;
    void fetchStatus(selectedConfigId);
    void fetchPostingStats(selectedConfigId);
    void fetchRecentPosts(selectedConfigId);
  }, [selectedConfigId]);

  useEffect(() => {
    const handlePostedDiscussionUpdate = () => {
      void fetchPostingStats(selectedConfigId || undefined);
      if (selectedConfigId) {
        void fetchRecentPosts(selectedConfigId);
        void fetchStatus(selectedConfigId);
      }
    };

    window.addEventListener(
      'posted-discussions:updated',
      handlePostedDiscussionUpdate
    );
    return () =>
      window.removeEventListener(
        'posted-discussions:updated',
        handlePostedDiscussionUpdate
      );
  }, [selectedConfigId]);

  useEffect(() => {
    if (!selectedConfigId && !hasActiveConfigs) return;

    const interval = window.setInterval(
      () => {
        void fetchActiveConfigs();
        void fetchPostingStats(selectedConfigId || undefined);
        if (selectedConfigId) {
          void fetchStatus(selectedConfigId);
          void fetchRecentPosts(selectedConfigId);
        }
      },
      hasActiveConfigs ? 5000 : 10000
    );

    return () => window.clearInterval(interval);
  }, [selectedConfigId, hasActiveConfigs]);

  const handleStart = async () => {
    if (!selectedConfigId) {
      alert('Please select a website configuration first');
      return;
    }

    setStarting(true);
    try {
      const response = await fetch('/api/auto-poster/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteConfigId: selectedConfigId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start auto-poster');
      }
      await refreshAll(selectedConfigId);
      onRefreshConfigs?.();
    } catch (error: any) {
      alert(error?.message || 'Failed to start auto-poster');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async (configId: string) => {
    setStoppingConfigId(configId);
    try {
      const response = await fetch('/api/auto-poster/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteConfigId: configId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to stop auto-poster');
      }
      if (selectedConfigId === configId) {
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                isRunning: false,
                nextPostTime: null,
                lastPostResult: 'Stopped',
              }
            : prev
        );
        setSelectedConfigId('');
      }
      await refreshAll(selectedConfigId === configId ? '' : selectedConfigId);
      onRefreshConfigs?.();
    } catch (error: any) {
      alert(error?.message || 'Failed to stop auto-poster');
    } finally {
      setStoppingConfigId(null);
    }
  };

  const formatNextPostTime = (nextPostTime: Date | null) => {
    if (!nextPostTime) return 'Not scheduled';
    const diff = nextPostTime.getTime() - Date.now();
    if (diff <= 0) return 'Now';
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const selectedConfig = useMemo(
    () =>
      websiteConfigs.find((config) => config.id === selectedConfigId) || null,
    [selectedConfigId, websiteConfigs]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-700 bg-gray-800 p-6 shadow-md">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Auto-Poster</h2>
            <p className="mt-1 text-sm text-gray-400">
              Run server-managed comment campaigns and monitor activity from
              this page.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">
            <span
              className={`h-3 w-3 rounded-full ${hasActiveConfigs ? 'bg-green-500' : 'bg-gray-500'}`}
            />
            {hasActiveConfigs
              ? `${activeConfigs.length} active configuration${activeConfigs.length === 1 ? '' : 's'}`
              : 'No active auto-posters'}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
            <div className="text-2xl font-bold text-blue-400">
              {postingStats.postsToday}
            </div>
            <div className="text-sm text-gray-300">Posts Today</div>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
            <div className="text-2xl font-bold text-green-400">
              {postingStats.totalPosts}
            </div>
            <div className="text-sm text-gray-300">Total Posts</div>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
            <div className="text-sm font-medium text-purple-400">
              {status?.nextPostTime
                ? formatNextPostTime(status.nextPostTime)
                : 'Not scheduled'}
            </div>
            <div className="text-sm text-gray-300">Next Post In</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-700 bg-gray-800 p-6 shadow-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Start a New Auto-Poster
          </h3>
          <button
            onClick={() => void refreshAll(selectedConfigId || undefined)}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Refresh
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="website-config"
              className="mb-2 block text-sm font-medium text-gray-300"
            >
              Website Configuration
            </label>
            <select
              id="website-config"
              value={selectedConfigId}
              onChange={(e) => setSelectedConfigId(e.target.value)}
              className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="">Select a website configuration...</option>
              {websiteConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {(config.website_url || config.url) ?? 'Untitled config'} -{' '}
                  {(
                    config.website_description ||
                    config.description ||
                    'No description'
                  ).slice(0, 60)}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleStart}
            disabled={starting || !selectedConfigId}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
          >
            {starting ? 'Starting…' : 'Start Auto-Posting'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-700 bg-gray-800 p-6 shadow-md">
        <h3 className="mb-4 text-lg font-semibold text-white">
          Active Configurations
        </h3>
        {activeConfigs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-600 p-6 text-sm text-gray-400">
            No active auto-posters yet.
          </div>
        ) : (
          <div className="space-y-3">
            {activeConfigs.map((config) => (
              <div
                key={config.id}
                className="rounded-xl border border-gray-700 bg-gray-900/60 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-medium text-white">
                      {config.currentWebsiteConfig?.website_url ||
                        config.currentWebsiteConfig?.url}
                    </div>
                    <div className="mt-1 text-sm text-gray-400">
                      {config.postsToday} posts today • {config.totalPosts}{' '}
                      total • next run{' '}
                      {config.nextPostTime
                        ? new Date(config.nextPostTime).toLocaleString()
                        : 'not scheduled'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setSelectedConfigId(config.websiteConfigId)
                      }
                      className="rounded-md bg-gray-700 px-3 py-2 text-sm text-white hover:bg-gray-600"
                    >
                      View Running Details
                    </button>
                    <button
                      onClick={() => handleStop(config.websiteConfigId)}
                      disabled={stoppingConfigId === config.websiteConfigId}
                      className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-400"
                    >
                      {stoppingConfigId === config.websiteConfigId
                        ? 'Stopping…'
                        : 'Stop'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedConfigId && status && (
        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-6 shadow-md">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Running Details
              </h3>
              <p className="text-sm text-gray-400">
                {selectedConfig?.website_url ||
                  selectedConfig?.url ||
                  'Selected configuration'}
              </p>
            </div>
            {status.isRunning ? (
              <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
                Running
              </span>
            ) : (
              <span className="rounded-full border border-gray-600 bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300">
                Stopped
              </span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Assigned account
              </div>
              <div className="mt-2 text-white">{status.redditAccount}</div>
            </div>
            <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Posting interval
              </div>
              <div className="mt-2 text-white">
                Every {status.intervalMinutes} minutes
              </div>
            </div>
            <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Daily max
              </div>
              <div className="mt-2 text-white">{status.maxPostsPerDay}</div>
            </div>
            <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Last post
              </div>
              <div className="mt-2 text-white">
                {status.lastPostTime
                  ? new Date(status.lastPostTime).toLocaleString()
                  : 'Never'}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-gray-700 bg-gray-900/60 p-4">
            <h4 className="text-sm font-semibold text-white">
              Recent Auto-Poster Activity
            </h4>
            <div className="mt-3 space-y-3">
              {recentPosts.length === 0 ? (
                <div className="text-sm text-gray-400">
                  No posted comments recorded for this configuration yet.
                </div>
              ) : (
                recentPosts.map((post) => (
                  <div
                    key={post.id}
                    className="rounded-lg border border-gray-700 bg-gray-950/50 p-3"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-medium text-white">
                          {post.post_title}
                        </div>
                        <div className="text-xs text-gray-400">
                          r/{post.subreddit} •{' '}
                          {new Date(post.created_at).toLocaleString()}
                        </div>
                      </div>
                      {post.comment_url && (
                        <a
                          href={post.comment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-400 hover:text-blue-300"
                        >
                          Open Comment ↗
                        </a>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-gray-300">
                      {post.comment_posted}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="text-sm text-gray-400">
          Refreshing auto-poster data…
        </div>
      )}
    </div>
  );
}
