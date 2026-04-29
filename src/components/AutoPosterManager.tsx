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

const SERVER_POLL_INTERVAL_MS = 5 * 60 * 1000;

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
  const [nowMs, setNowMs] = useState(() => Date.now());

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
    if (response.ok) setRecentPosts(data.posts || []);
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
      SERVER_POLL_INTERVAL_MS
    );
    return () => window.clearInterval(interval);
  }, [selectedConfigId, hasActiveConfigs]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const handleStart = async () => {
    if (!selectedConfigId)
      return alert('Please select a website configuration first');
    setStarting(true);
    try {
      const response = await fetch('/api/auto-poster/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteConfigId: selectedConfigId }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Failed to start auto-poster');
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
      if (!response.ok)
        throw new Error(data.error || 'Failed to stop auto-poster');
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
    const diff = nextPostTime.getTime() - nowMs;
    if (diff <= 0) return 'Now';
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const formatNextPostValue = (nextPostTime: string | null) =>
    nextPostTime ? formatNextPostTime(new Date(nextPostTime)) : 'not scheduled';

  const selectedConfig = useMemo(
    () =>
      websiteConfigs.find((config) => config.id === selectedConfigId) || null,
    [selectedConfigId, websiteConfigs]
  );

  return (
    <div className="space-y-6">
      <section className="surface-card p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-zinc-50">
              Auto-poster
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Run server-managed comment campaigns and monitor activity from one
              calm control surface.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
            {hasActiveConfigs
              ? `${activeConfigs.length} active configuration${activeConfigs.length === 1 ? '' : 's'}`
              : 'No active auto-posters'}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Posts today', postingStats.postsToday],
            ['Total posts', postingStats.totalPosts],
            [
              'Next run',
              status?.nextPostTime
                ? formatNextPostTime(status.nextPostTime)
                : 'Not scheduled',
            ],
          ].map(([label, value]) => (
            <div key={label as string} className="surface-subtle p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                {label}
              </div>
              <div className="mt-3 text-2xl font-semibold text-zinc-50">
                {value as any}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-50">
            Start a new auto-poster
          </h3>
          <button
            onClick={() => void refreshAll(selectedConfigId || undefined)}
            className="text-sm text-zinc-400 hover:text-zinc-100"
          >
            Refresh
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="website-config"
              className="mb-2 block text-sm font-medium text-zinc-700"
            >
              Website configuration
            </label>
            <select
              id="website-config"
              value={selectedConfigId}
              onChange={(e) => setSelectedConfigId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-zinc-100 shadow-sm focus:border-[#7c6cff] focus:outline-none focus:ring-[#7c6cff]"
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
            className="ui-button-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? 'Starting…' : 'Start auto-poster'}
          </button>
        </div>
      </section>

      <section className="surface-card p-6">
        <h3 className="mb-4 text-lg font-semibold text-zinc-50">
          Active configurations
        </h3>
        {activeConfigs.length === 0 ? (
          <div className="surface-subtle p-6 text-sm text-zinc-500">
            No active auto-posters yet.
          </div>
        ) : (
          <div className="space-y-3">
            {activeConfigs.map((config) => (
              <div key={config.id} className="surface-subtle p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-medium text-zinc-50">
                      {config.currentWebsiteConfig?.website_url ||
                        config.currentWebsiteConfig?.url}
                    </div>
                    <div className="mt-1 text-sm text-zinc-500">
                      {config.postsToday} posts today • {config.totalPosts}{' '}
                      total • next run{' '}
                      {formatNextPostValue(config.nextPostTime)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setSelectedConfigId(config.websiteConfigId)
                      }
                      className="ui-button-secondary"
                    >
                      View details
                    </button>
                    <button
                      onClick={() => handleStop(config.websiteConfigId)}
                      disabled={stoppingConfigId === config.websiteConfigId}
                      className="ui-button-danger disabled:opacity-50"
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
      </section>

      {selectedConfigId && status && (
        <section className="surface-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-zinc-50">
                Running details
              </h3>
              <p className="text-sm text-zinc-500">
                {selectedConfig?.website_url ||
                  selectedConfig?.url ||
                  'Selected configuration'}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${status.isRunning ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border border-white/10 bg-zinc-950 text-zinc-300'}`}
            >
              {status.isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Posting network', 'Managed rotation'],
              ['Posting interval', `Every ${status.intervalMinutes} minutes`],
              ['Daily max', status.maxPostsPerDay],
              [
                'Last post',
                status.lastPostTime
                  ? new Date(status.lastPostTime).toLocaleString()
                  : 'Never',
              ],
            ].map(([label, value]) => (
              <div key={label as string} className="surface-subtle p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  {label}
                </div>
                <div className="mt-2 text-sm font-medium text-zinc-50">
                  {value as any}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 surface-subtle p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Recent auto-poster activity
            </h4>
            <div className="mt-3 space-y-3">
              {recentPosts.length === 0 ? (
                <div className="text-sm text-zinc-500">
                  No posted comments recorded for this configuration yet.
                </div>
              ) : (
                recentPosts.map((post) => (
                  <div
                    key={post.id}
                    className="rounded-2xl border border-white/10 bg-zinc-950 p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-medium text-zinc-50">
                          {post.post_title}
                        </div>
                        <div className="text-xs text-zinc-500">
                          r/{post.subreddit} •{' '}
                          {new Date(post.created_at).toLocaleString()}
                        </div>
                      </div>
                      {post.comment_url ? (
                        <a
                          href={post.comment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-zinc-50 underline-offset-4 hover:underline"
                        >
                          Open comment ↗
                        </a>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-600">
                      {post.comment_posted}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {loading && (
        <div className="text-sm text-zinc-500">
          Refreshing auto-poster data…
        </div>
      )}
    </div>
  );
}
