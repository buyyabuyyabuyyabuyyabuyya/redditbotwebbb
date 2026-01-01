'use client';

import { useState, useEffect } from 'react';
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
    filtering_reason?: string;
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
  comment_url?: string;
  website_config_id?: string;
}

export default function DiscussionPosterClient() {
  const { user, isLoaded } = useUser();
  const [activeTab, setActiveTab] = useState<'search' | 'autoposter' | 'config' | 'history'>('autoposter');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [discussions, setDiscussions] = useState<RedditDiscussion[]>([]);
  const [websiteConfigs, setWebsiteConfigs] = useState<WebsiteConfig[]>([]);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [postingHistory, setPostingHistory] = useState<PostingHistory[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (isLoaded && user) {
      loadWebsiteConfigs();
      loadAccountStatus();
    }
  }, [isLoaded, user]);

  const loadWebsiteConfigs = async () => {
    try {
      const response = await fetch('/api/website-config');
      if (response.ok) {
        const data = await response.json();
        setWebsiteConfigs(data.configs || []);
      }
    } catch (error) {
      console.error('Error loading website configs:', error);
    }
  };

  const loadAccountStatus = async () => {
    try {
      const response = await fetch('/api/reddit/accounts/available?action=status');
      if (response.ok) {
        const data = await response.json();
        setAccountStatus(data);
      }
    } catch (error) {
      console.error('Error loading account status:', error);
    }
  };

  const loadPostingHistory = async (configId?: string) => {
    try {
      const url = new URL('/api/posted-discussions', window.location.origin);
      url.searchParams.append('action', 'list');
      url.searchParams.append('limit', '50');
      if (configId) url.searchParams.append('website_config_id', configId);

      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        setPostingHistory(data.posts || []);
      }
    } catch (error) {
      console.error('Error loading posting history:', error);
    }
  };

  const generateRedditSearchQueries = (description: string, customerSegments: string) => {
    // Simple query generation based on description
    const keywords = description.split(' ').slice(0, 3).join(' ');
    return [keywords];
  };

  const searchMultipleSubredditsWithPagination = async (
    query: string,
    userId: string,
    subreddits: string[] | undefined,
    limit: number,
    config: WebsiteConfig,
    usePagination: boolean
  ): Promise<RedditDiscussion[]> => {
    try {
      // Use the new Gemini-powered relevant discussions endpoint
      const response = await fetch('/api/discussions/relevant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          configId: config.id,
          preview: true
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.discussions || [];
      }
      return [];
    } catch (error) {
      console.error('Error searching discussions:', error);
      return [];
    }
  };

  const handleSearch = async () => {
    if (!user?.id || !selectedConfigId) {
      alert('Please select a website configuration first');
      return;
    }

    const selectedConfig = websiteConfigs.find(config => config.id === selectedConfigId);
    if (!selectedConfig) {
      alert('Selected website configuration not found');
      return;
    }

    setIsSearching(true);
    try {
      let queries: string[];

      if (searchQuery.trim()) {
        queries = [searchQuery.trim()];
      } else {
        // Generate queries based on website config
        queries = generateRedditSearchQueries(
          selectedConfig.description,
          selectedConfig.customer_segments.join(' ')
        );
      }

      const results = await searchMultipleSubredditsWithPagination(
        queries[0],
        user.id,
        undefined, // Use default subreddits
        10,
        selectedConfig,
        true // Use pagination
      );

      setDiscussions(results);
    } catch (error) {
      console.error('Error searching discussions:', error);
      alert('Error searching discussions. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handlePostComment = async (discussion: RedditDiscussion, comment: string) => {
    try {
      const response = await fetch('/api/reddit/post-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postId: discussion.id,
          subreddit: discussion.subreddit,
          comment: comment,
          accountId: 'auto', // Let the system choose the best available account
          userId: user?.id
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert('Comment posted successfully!');

        // Record the posted discussion
        await fetch('/api/posted-discussions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            website_config_id: selectedConfigId,
            reddit_post_id: discussion.id,
            subreddit: discussion.subreddit,
            post_title: discussion.title,
            comment_posted: comment
          })
        });

        // Refresh discussions to remove posted ones
        handleSearch();
      } else {
        alert(`Failed to post comment: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error posting comment:', error);
      alert('Error posting comment. Please try again.');
    }
  };

  if (!isLoaded) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  if (!user) {
    return <div className="text-center p-8">Please sign in to access the discussion poster.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Discussion Poster</h1>
          <p className="mt-2 text-gray-600">
            Find and engage with relevant Reddit discussions for your business
          </p>
        </div>

        {/* Account Status Bar */}
        {accountStatus && (
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full mr-2 ${accountStatus.accounts?.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm font-medium">
                    {accountStatus.accounts?.length || 0} Reddit accounts available
                  </span>
                </div>
                {accountStatus.estimatedWaitMinutes && (
                  <span className="text-sm text-yellow-600">
                    Next available in {accountStatus.estimatedWaitMinutes}m
                  </span>
                )}
              </div>
              <button
                onClick={loadAccountStatus}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Refresh
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              {[
                { id: 'autoposter', label: 'Auto-Poster', icon: '🤖' },
                { id: 'config', label: 'Website Config', icon: '⚙️' },
                { id: 'history', label: 'History', icon: '📝' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    if (tab.id === 'history') loadPostingHistory(selectedConfigId);
                  }}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))
              }
            </nav>
          </div>

          <div className="p-6">
            {/* Search & Post Tab */}
            {activeTab === 'search' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Website Configuration
                    </label>
                    <select
                      value={selectedConfigId}
                      onChange={(e) => setSelectedConfigId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select a website configuration...</option>
                      {websiteConfigs.map((config) => (
                        <option key={config.id} value={config.id}>
                          {config.url} - {config.description?.substring(0, 40) || 'No description'}...
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Custom Search Query (Optional)
                    </label>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Leave empty to use auto-generated queries"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSearch}
                  disabled={isSearching || !selectedConfigId}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSearching ? 'Searching...' : 'Search Relevant Discussions'}
                </button>

                {/* Search Results */}
                {discussions.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium text-gray-900">
                        Found {discussions.length} Relevant Discussions (Gemini AI Filtered)
                      </h3>
                      <div className="text-sm text-gray-500">
                        Sorted by relevance score
                      </div>
                    </div>
                    {discussions.map((discussion) => (
                      <DiscussionCard
                        key={discussion.id}
                        discussion={discussion}
                        onPostComment={handlePostComment}
                        websiteConfig={websiteConfigs.find(c => c.id === selectedConfigId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Auto-Poster Tab */}
            {activeTab === 'autoposter' && (
              <AutoPosterManager
                websiteConfigs={websiteConfigs}
                onRefreshConfigs={loadWebsiteConfigs}
              />
            )}

            {/* Website Config Tab */}
            {activeTab === 'config' && (
              <WebsiteConfigManagerStepByStep onConfigsChange={loadWebsiteConfigs} />
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Posting History</h3>
                {postingHistory.length === 0 ? (
                  <p className="text-gray-500">No posting history yet.</p>
                ) : (
                  <div className="space-y-3">
                    {postingHistory.map((post) => (
                      <div key={post.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900">{post.post_title}</h4>
                            <p className="text-sm text-gray-600 mt-1">r/{post.subreddit}</p>
                            <p className="text-sm text-gray-500 mt-2">{post.comment_posted}</p>
                            {post.comment_url && (
                              <a
                                href={post.comment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-800 mt-2 block"
                              >
                                View Comment on Reddit ↗
                              </a>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(post.created_at).toLocaleDateString()}
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

// Discussion Card Component
interface DiscussionCardProps {
  discussion: RedditDiscussion;
  onPostComment: (discussion: RedditDiscussion, comment: string) => void;
  websiteConfig?: WebsiteConfig;
}

function DiscussionCard({ discussion, onPostComment, websiteConfig }: DiscussionCardProps) {
  const [comment, setComment] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const generateSuggestedComment = () => {
    if (!websiteConfig) return '';

    const templates = [
      `I've been working on something that might help with this. ${websiteConfig.description} - you can check it out at ${websiteConfig.url}. Would love to get your thoughts!`,
      `This is exactly the kind of problem we're trying to solve. We built ${websiteConfig.url} to help with ${websiteConfig.description.toLowerCase()}. Happy to share more details if you're interested!`,
      `Great discussion! We actually created a solution for this at ${websiteConfig.url}. ${websiteConfig.description} Feel free to check it out and let me know what you think.`
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  };

  const handleGenerateComment = () => {
    setComment(generateSuggestedComment());
  };

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h4 className="font-medium text-gray-900">{discussion.title}</h4>
            {discussion.relevance_scores && (
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRelevanceColor(discussion.relevance_scores.final_score)}`}>
                  🤖 {discussion.relevance_scores.final_score}% Relevant
                </span>
                {discussion.is_posted && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium text-gray-600 bg-gray-100">
                    ✅ Posted
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <span>r/{discussion.subreddit}</span>
            <span>by u/{discussion.author}</span>
            <span>{discussion.score} upvotes</span>
            <span>{discussion.num_comments} comments</span>
            <span>{formatTimeAgo(discussion.created_utc)}</span>
          </div>
          {discussion.relevance_scores && (
            <div className="mt-2 text-xs text-gray-600">
              <div className="flex gap-4">
                <span>Intent: {discussion.relevance_scores.intent_score}%</span>
                <span>Context: {discussion.relevance_scores.context_match_score}%</span>
                <span>Quality: {discussion.relevance_scores.quality_score}%</span>
                <span>Engagement: {discussion.relevance_scores.engagement_score}%</span>
              </div>
            </div>
          )}
        </div>
        <a
          href={discussion.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          View on Reddit →
        </a>
      </div>

      {discussion.content && (
        <div className="mb-3">
          <p className="text-gray-700 text-sm">
            {isExpanded ? discussion.content : `${discussion.content?.substring(0, 200) || 'No content'}...`}
          </p>
          {(discussion.content?.length || 0) > 200 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-blue-600 hover:text-blue-800 text-sm mt-1"
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex space-x-2">
          <button
            onClick={handleGenerateComment}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Generate Comment
          </button>
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Write your comment here..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
        />

        <button
          onClick={() => onPostComment(discussion, comment)}
          disabled={!comment.trim()}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
        >
          Post Comment
        </button>
      </div>
    </div>
  );
}
