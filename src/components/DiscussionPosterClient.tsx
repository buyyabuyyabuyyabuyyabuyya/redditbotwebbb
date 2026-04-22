'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import AutoPosterManager from './AutoPosterManager';
import WebsiteConfigManagerStepByStep from './WebsiteConfigManagerStepByStep';
import { WebsiteConfig } from '../lib/relevanceFiltering';

interface RedditDiscussion {
  id: string;
  title: string;
  content: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
  url: string;
  relevance_scores?: {
    final_score: number;
    intent_score: number;
    context_match_score: number;
    quality_score: number;
    engagement_score: number;
  };
  is_posted?: boolean;
}

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
    'search' | 'autoposter' | 'config' | 'history'
  >('search');
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [websiteConfigs, setWebsiteConfigs] = useState<WebsiteConfig[]>([]);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(
    null
  );
  const [discussions, setDiscussions] = useState<RedditDiscussion[]>([]);
  const [postingHistory, setPostingHistory] = useState<PostingHistory[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const selectedConfig = useMemo(
    () =>
      websiteConfigs.find((config) => config.id === selectedConfigId) || null,
    [selectedConfigId, websiteConfigs]
  );

  const loadWebsiteConfigs = async () => {
    const response = await fetch('/api/website-config');
    const data = await response.json();
    if (response.ok) {
      setWebsiteConfigs(data.configs || []);
      if (!selectedConfigId && data.configs?.length) {
        setSelectedConfigId(data.configs[0].id);
      }
    }
  };

  const loadAccountStatus = async () => {
    const response = await fetch(
      '/api/reddit/accounts/available?action=status'
    );
    const data = await response.json();
    if (response.ok) setAccountStatus(data);
  };

  const loadPostingHistory = async (configId?: string) => {
    const url = new URL('/api/posted-discussions', window.location.origin);
    url.searchParams.set('action', 'list');
    url.searchParams.set('limit', '50');
    if (configId) url.searchParams.set('website_config_id', configId);

    const response = await fetch(url.toString());
    const data = await response.json();
    if (response.ok) setPostingHistory(data.posts || []);
  };

  useEffect(() => {
    if (!isLoaded || !user) return;
    void Promise.all([loadWebsiteConfigs(), loadAccountStatus()]);
  }, [isLoaded, user]);

  useEffect(() => {
    if (activeTab === 'history') {
      void loadPostingHistory(selectedConfigId || undefined);
    }
  }, [activeTab, selectedConfigId]);

  useEffect(() => {
    const refreshHistory = () => {
      if (activeTab === 'history') {
        void loadPostingHistory(selectedConfigId || undefined);
      }
    };

    window.addEventListener('posted-discussions:updated', refreshHistory);
    return () =>
      window.removeEventListener('posted-discussions:updated', refreshHistory);
  }, [activeTab, selectedConfigId]);

  const handleSearch = async () => {
    if (!user?.id || !selectedConfigId) {
      alert('Please select a website configuration first');
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch('/api/discussions/relevant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          configId: selectedConfigId,
          preview: true,
          query: searchQuery.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to search discussions');
      }
      setDiscussions(data.discussions || []);
    } catch (error: any) {
      alert(error?.message || 'Error searching discussions');
    } finally {
      setIsSearching(false);
    }
  };

  const handlePostComment = async (
    discussion: RedditDiscussion,
    comment: string
  ) => {
    if (!selectedConfigId) {
      alert('Please select a website configuration first');
      return;
    }

    try {
      const response = await fetch('/api/reddit/post-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: discussion.id,
          subreddit: discussion.subreddit,
          comment,
          accountId: 'auto',
          userId: user?.id,
          websiteConfigId: selectedConfigId,
          postTitle: discussion.title,
          relevanceScore: discussion.relevance_scores?.final_score,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to post comment');
      }

      setDiscussions((current) =>
        current.map((item) =>
          item.id === discussion.id ? { ...item, is_posted: true } : item
        )
      );
      window.dispatchEvent(new CustomEvent('posted-discussions:updated'));
      if (activeTab === 'history') {
        void loadPostingHistory(selectedConfigId);
      }
      alert('Comment posted successfully!');
    } catch (error: any) {
      alert(error?.message || 'Error posting comment. Please try again.');
    }
  };

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
    { id: 'search', label: 'Find Discussions', icon: '🔎' },
    { id: 'autoposter', label: 'Auto-Poster', icon: '🤖' },
    { id: 'config', label: 'Website Configs', icon: '⚙️' },
    { id: 'history', label: 'Posted Comments', icon: '📝' },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-900 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-gray-700 bg-gray-800/70 p-6 shadow-lg">
          <h1 className="text-3xl font-bold text-white">
            Comment Outreach Workspace
          </h1>
          <p className="mt-2 max-w-3xl text-gray-300">
            Discover relevant Reddit discussions, draft useful comments, and run
            comment-only auto-posters from one workflow.
          </p>
        </div>

        {accountStatus && (
          <div className="mb-6 rounded-xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center">
                  <div
                    className={`mr-2 h-3 w-3 rounded-full ${accountStatus.accounts?.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                  />
                  <span className="text-sm font-medium text-gray-200">
                    {accountStatus.accounts?.length || 0} Reddit account
                    {accountStatus.accounts?.length === 1 ? '' : 's'} available
                  </span>
                </div>
                {accountStatus.estimatedWaitMinutes ? (
                  <span className="text-sm text-yellow-400">
                    Next available in {accountStatus.estimatedWaitMinutes}m
                  </span>
                ) : null}
              </div>
              <button
                onClick={() => void loadAccountStatus()}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Refresh
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-gray-700 bg-gray-800 shadow-sm">
          <div className="border-b border-gray-700 px-6">
            <nav className="-mb-px flex flex-wrap gap-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`border-b-2 px-1 py-4 text-sm font-medium ${activeTab === tab.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:border-gray-600 hover:text-gray-200'}`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'search' && (
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">
                      Website Configuration
                    </label>
                    <select
                      value={selectedConfigId}
                      onChange={(e) => setSelectedConfigId(e.target.value)}
                      className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    >
                      <option value="">
                        Select a website configuration...
                      </option>
                      {websiteConfigs.map((config) => (
                        <option key={config.id} value={config.id}>
                          {(config.website_url || config.url) ??
                            'Untitled config'}{' '}
                          -{' '}
                          {(
                            config.website_description ||
                            config.description ||
                            'No description'
                          ).slice(0, 50)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">
                      Optional Search Hint
                    </label>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Leave empty to use config-based relevance search"
                      className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSearch}
                  disabled={isSearching || !selectedConfigId}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
                >
                  {isSearching ? 'Searching…' : 'Find Relevant Discussions'}
                </button>

                {discussions.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-white">
                        Found {discussions.length} relevant discussions
                      </h3>
                      <div className="text-sm text-gray-400">
                        Sorted by AI relevance
                      </div>
                    </div>
                    {discussions.map((discussion) => (
                      <DiscussionCard
                        key={discussion.id}
                        discussion={discussion}
                        onPostComment={handlePostComment}
                        websiteConfig={selectedConfig}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-600 p-6 text-sm text-gray-400">
                    Search results will appear here after you run a relevance
                    search.
                  </div>
                )}
              </div>
            )}

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
                      Posted Comment History
                    </h3>
                    <p className="text-sm text-gray-400">
                      Review the comments your workspace has already posted.
                    </p>
                  </div>
                  <select
                    value={selectedConfigId}
                    onChange={(e) => setSelectedConfigId(e.target.value)}
                    className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white md:max-w-md"
                  >
                    <option value="">All website configurations</option>
                    {websiteConfigs.map((config) => (
                      <option key={config.id} value={config.id}>
                        {config.website_url || config.url}
                      </option>
                    ))}
                  </select>
                </div>

                {postingHistory.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-600 p-6 text-sm text-gray-400">
                    No posted comments yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {postingHistory.map((post) => (
                      <div
                        key={post.id}
                        className="rounded-lg border border-gray-700 bg-gray-900/60 p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-white">
                              {post.post_title}
                            </h4>
                            <p className="mt-1 text-sm text-gray-400">
                              r/{post.subreddit}
                            </p>
                            <p className="mt-2 text-sm text-gray-300">
                              {post.comment_posted}
                            </p>
                            {post.comment_url ? (
                              <a
                                href={post.comment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-block text-sm text-blue-400 hover:text-blue-300"
                              >
                                View Comment on Reddit ↗
                              </a>
                            ) : null}
                          </div>
                          <div className="text-sm text-gray-400">
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

function DiscussionCard({
  discussion,
  onPostComment,
  websiteConfig,
}: {
  discussion: RedditDiscussion;
  onPostComment: (discussion: RedditDiscussion, comment: string) => void;
  websiteConfig: WebsiteConfig | null;
}) {
  const [comment, setComment] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const generateSuggestedComment = () => {
    if (!websiteConfig) return '';
    const websiteUrl = websiteConfig.website_url || websiteConfig.url;
    const websiteDescription =
      websiteConfig.website_description || websiteConfig.description;
    const templates = [
      `This sounds familiar. I've been building ${websiteUrl} to help with exactly this kind of workflow. ${websiteDescription}`,
      `You may find ${websiteUrl} helpful here. We're focused on ${websiteDescription.toLowerCase()}. Curious if this approach would fit your use case?`,
      `Interesting thread. I'm working on ${websiteUrl}, which is built around ${websiteDescription.toLowerCase()}. Happy to share how we're thinking about this.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  };

  const formatTimeAgo = (timestamp: number) => {
    const diff = Date.now() / 1000 - timestamp;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const relevanceScore = discussion.relevance_scores?.final_score ?? 0;
  const relevanceColor =
    relevanceScore >= 80
      ? 'text-green-400 bg-green-900/30'
      : relevanceScore >= 60
        ? 'text-yellow-400 bg-yellow-900/30'
        : 'text-red-400 bg-red-900/30';

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h4 className="font-medium text-white">{discussion.title}</h4>
            {discussion.relevance_scores ? (
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${relevanceColor}`}
              >
                🤖 {relevanceScore}% relevant
              </span>
            ) : null}
            {discussion.is_posted ? (
              <span className="rounded-full bg-gray-700 px-2 py-1 text-xs font-medium text-gray-300">
                ✅ Posted
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
            <span>r/{discussion.subreddit}</span>
            <span>by u/{discussion.author}</span>
            <span>{discussion.score} upvotes</span>
            <span>{discussion.num_comments} comments</span>
            <span>{formatTimeAgo(discussion.created_utc)}</span>
          </div>
        </div>
        <a
          href={discussion.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          View on Reddit →
        </a>
      </div>

      <div className="mb-3 text-sm text-gray-300">
        {isExpanded
          ? discussion.content || 'No additional post content.'
          : `${(discussion.content || '').slice(0, 220)}${(discussion.content || '').length > 220 ? '…' : ''}`}
        {(discussion.content || '').length > 220 ? (
          <button
            onClick={() => setIsExpanded((value) => !value)}
            className="ml-2 text-blue-400 hover:text-blue-300"
          >
            {isExpanded ? 'Show less' : 'Read more'}
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setComment(generateSuggestedComment())}
            className="rounded-md bg-gray-700 px-3 py-2 text-sm text-white hover:bg-gray-600"
          >
            Generate Comment
          </button>
          <button
            onClick={() => setComment('')}
            className="rounded-md border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            Clear
          </button>
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="Draft a helpful, non-spammy comment here..."
          className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        />
        <button
          onClick={() => onPostComment(discussion, comment)}
          disabled={!comment.trim() || discussion.is_posted}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
        >
          {discussion.is_posted ? 'Already Posted' : 'Post Comment'}
        </button>
      </div>
    </div>
  );
}
