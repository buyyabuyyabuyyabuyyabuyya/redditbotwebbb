'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { ExternalLink, MessageSquare, Calendar, TrendingUp, Eye } from 'lucide-react';

interface DiscussionCampaign {
  id: string;
  name: string;
  url: string;
  description: string;
  created_at: string;
  status: string;
  total_comments: number;
  last_comment_at: string | null;
}

interface CampaignComment {
  id: string;
  comment_url: string;
  reply_text: string;
  subreddit: string;
  relevance_score: number;
  posted_at: string;
  status: string;
}

export default function DiscussionCampaigns() {
  const { user } = useUser();
  const [campaigns, setCampaigns] = useState<DiscussionCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [campaignComments, setCampaignComments] = useState<CampaignComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchCampaigns();
    }
  }, [user]);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/discussion-campaigns');
      const data = await res.json();
      
      if (data.success) {
        setCampaigns(data.campaigns);
      }
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaignComments = async (campaignId: string) => {
    try {
      setCommentsLoading(true);
      const res = await fetch(`/api/discussion-campaigns/${campaignId}/comments`);
      const data = await res.json();
      
      if (data.success) {
        setCampaignComments(data.comments);
      }
    } catch (error) {
      console.error('Failed to fetch campaign comments:', error);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleViewComments = (campaignId: string) => {
    setSelectedCampaign(campaignId);
    fetchCampaignComments(campaignId);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Discussion Campaigns</h2>
          <p className="text-gray-400 mt-1">
            View your automated Reddit discussion campaigns and their performance
          </p>
        </div>
      </div>

      {selectedCampaign ? (
        // Comments View
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setSelectedCampaign(null)}
              variant="secondary"
            >
              ← Back to Campaigns
            </Button>
            <h3 className="text-xl font-semibold text-white">
              Campaign Comments
            </h3>
          </div>

          {commentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid gap-4">
              {campaignComments.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-300 mb-2">
                      No Comments Yet
                    </h3>
                    <p className="text-gray-500">
                      This campaign hasn't generated any comments yet. Check back later!
                    </p>
                  </CardContent>
                </Card>
              ) : (
                campaignComments.map((comment) => (
                  <Card key={comment.id} className="bg-gray-800 border-gray-700">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <Badge 
                            variant={comment.status === 'posted' ? 'default' : 'outline'}
                            className="capitalize"
                          >
                            {comment.status}
                          </Badge>
                          <span className="text-sm text-gray-400">
                            r/{comment.subreddit}
                          </span>
                          <div className="flex items-center gap-1">
                            <TrendingUp className="h-4 w-4 text-green-500" />
                            <span className="text-sm text-green-500">
                              {comment.relevance_score}% relevance
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-400">
                            {formatDate(comment.posted_at)}
                          </span>
                          <a
                            href={comment.comment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                      
                      <div className="bg-gray-900 rounded-lg p-4">
                        <p className="text-gray-300 text-sm leading-relaxed">
                          {comment.reply_text}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        // Campaigns List View
        <div className="grid gap-6">
          {campaigns.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-300 mb-2">
                  No Campaigns Yet
                </h3>
                <p className="text-gray-500 mb-6">
                  Start your first discussion campaign using the AI-Powered Reddit Outreach workflow above.
                </p>
              </CardContent>
            </Card>
          ) : (
            campaigns.map((campaign) => (
              <Card key={campaign.id} className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-white mb-2">
                        {campaign.name}
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        {campaign.description}
                      </CardDescription>
                    </div>
                    <Badge 
                      variant={campaign.status === 'active' ? 'default' : 'outline'}
                      className="capitalize"
                    >
                      {campaign.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <a
                      href={campaign.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {campaign.url}
                    </a>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="text-center p-3 bg-gray-900 rounded-lg">
                      <div className="flex items-center justify-center mb-2">
                        <MessageSquare className="h-5 w-5 text-blue-500" />
                      </div>
                      <div className="text-xl font-bold text-white">
                        {campaign.total_comments}
                      </div>
                      <div className="text-sm text-gray-400">Total Comments</div>
                    </div>
                    
                    <div className="text-center p-3 bg-gray-900 rounded-lg">
                      <div className="flex items-center justify-center mb-2">
                        <Calendar className="h-5 w-5 text-green-500" />
                      </div>
                      <div className="text-xl font-bold text-white">
                        {formatDate(campaign.created_at).split(',')[0]}
                      </div>
                      <div className="text-sm text-gray-400">Created</div>
                    </div>

                    <div className="text-center p-3 bg-gray-900 rounded-lg">
                      <div className="flex items-center justify-center mb-2">
                        <TrendingUp className="h-5 w-5 text-purple-500" />
                      </div>
                      <div className="text-xl font-bold text-white">
                        {campaign.last_comment_at 
                          ? formatDate(campaign.last_comment_at).split(',')[0]
                          : 'Never'
                        }
                      </div>
                      <div className="text-sm text-gray-400">Last Comment</div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={() => handleViewComments(campaign.id)}
                      variant="primary"
                      className="flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      View Comments ({campaign.total_comments})
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
