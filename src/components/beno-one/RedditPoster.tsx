'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Textarea';
import { ExternalLink, MessageSquare, TrendingUp, Users } from 'lucide-react';
import { DiscussionItem } from '../../types/beno-workflow';

interface RedditPost {
  id: string;
  title: string;
  body: string;
  link: string;
  redditId: string;
  author: string;
  subreddit: {
    name: string;
    description: string;
    followers: number;
  } | null;
}

interface Reply {
  id: string;
  text: string;
  relevanceScore: number;
  validationScore: number;
  status: string;
  post: RedditPost;
}

interface RedditPosterProps {
  productId: string;
  accountId?: string; // Selected Reddit account ID
  generatedReplies?: DiscussionItem[];
}

export default function RedditPoster({ productId, generatedReplies = [] }: RedditPosterProps) {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState<string | null>(null);
  const [editingReply, setEditingReply] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (generatedReplies.length > 0) {
      // Convert generated replies to Reply format
      const convertedReplies: Reply[] = generatedReplies.map((discussion, index) => ({
        id: discussion.id || `generated_${index}`,
        text: discussion.generatedReply || '',
        relevanceScore: discussion.relevance_score || 0,
        validationScore: discussion.validationScore || 0,
        status: 'ready',
        post: {
          id: discussion.id || `post_${index}`,
          title: discussion.title || 'Discussion',
          body: discussion.content || discussion.comment || '',
          link: discussion.url || '',
          redditId: discussion.id || '',
          author: 'unknown',
          subreddit: {
            name: discussion.subreddit || 'unknown',
            description: '',
            followers: 0
          }
        }
      }));
      
      setReplies(convertedReplies);
      setLoading(false);
    } else {
      fetchReplies();
    }
  }, [productId, generatedReplies]);

  const fetchReplies = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/beno/ready-replies?productId=${productId}`);
      const data = await res.json();
      
      if (data.success) {
        setReplies(data.replies);
      } else {
        console.error('Failed to fetch replies:', data.error);
      }
    } catch (error) {
      console.error('Error fetching replies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async (reply: Reply) => {
    try {
      setPosting(reply.id);
      
      // Post comment to Reddit using our API
      const postRes = await fetch('/api/reddit/post-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'default', // You'll need to get this from user's selected account
          postId: reply.post.redditId,
          comment: reply.text,
          subreddit: reply.post.subreddit?.name || 'unknown'
        })
      });
      
      const postData = await postRes.json();
      
      if (postData.success) {
        // Update reply status to posted
        await fetch(`/api/beno/ready-replies?replyId=${reply.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'posted',
            posted_comment_url: postData.commentUrl,
            submitted_at: new Date().toISOString()
          })
        });
        
        // Remove from list
        setReplies(prev => prev.filter(r => r.id !== reply.id));
      } else if (postData.skipped) {
        // Handle skipped cases (thread locked, user blocked, etc.)
        alert(`Skipped: ${postData.reason}`);
      } else {
        throw new Error(postData.error || 'Failed to post');
      }
      
    } catch (error) {
      console.error('Error posting reply:', error);
      alert('Failed to post comment. Check console for details.');
    } finally {
      setPosting(null);
    }
  };

  const handleEdit = (reply: Reply) => {
    setEditingReply(reply.id);
    setEditText(reply.text);
  };

  const saveEdit = async (replyId: string) => {
    try {
      await fetch(`/api/beno/ready-replies?replyId=${replyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editText })
      });
      
      setReplies(prev => prev.map(r => 
        r.id === replyId ? { ...r, text: editText } : r
      ));
      
      setEditingReply(null);
      setEditText('');
    } catch (error) {
      console.error('Error updating reply:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'validation_passed': return 'bg-green-100 text-green-800';
      case 'validation_passed_manual_awaiting': return 'bg-blue-100 text-blue-800';
      case 'submitted': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Ready to Post</h2>
          <p className="text-gray-400">{replies.length} replies ready for Reddit posting</p>
        </div>
        <Button
          onClick={fetchReplies}
          variant="secondary"
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
          <p className="text-gray-400 mt-2">Loading replies...</p>
        </div>
      ) : replies.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <MessageSquare className="h-12 w-12 text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No replies ready</h3>
            <p className="text-gray-400">Check back later for new validated replies to post.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {replies.map((reply) => (
            <div key={reply.id} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-white font-medium text-lg mb-2">{reply.post.title}</h3>
                  <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
                    <span>Reddit Score: {reply.post.subreddit?.followers || 0}</span>
                    <span>Subreddit: r/{reply.post.subreddit?.name}</span>
                    <span className="text-blue-400 font-medium">Relevance: {reply.relevanceScore}%</span>
                  </div>
                </div>
              </div>
              
              <div className="mb-4">
                <p className="text-gray-300 text-sm bg-gray-900/30 p-3 rounded">
                  {reply.post.body?.substring(0, 300) || 'No content available'}
                  {reply.post.body && reply.post.body.length > 300 && '...'}
                </p>
              </div>
              
              {reply.text && (
                <div className="mb-4">
                  <h4 className="text-gray-300 font-medium mb-2">Generated AI Response:</h4>
                  {editingReply === reply.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="bg-gray-900 border-gray-600 text-white"
                        rows={4}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="small"
                          onClick={() => saveEdit(reply.id)}
                        >
                          Save
                        </Button>
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => setEditingReply(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-900/50 p-3 rounded">
                      <p className="text-white text-sm mb-2">{reply.text}</p>
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => handleEdit(reply)}
                        className="text-gray-400 hover:text-white"
                      >
                        Edit Reply
                      </Button>
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex items-center justify-between pt-3 border-t border-gray-700/50">
                <a
                  href={reply.post.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
                >
                  <ExternalLink className="h-4 w-4" />
                  View on Reddit
                </a>
                
                <Button
                  onClick={() => handlePost(reply)}
                  disabled={posting === reply.id}
                  className="bg-green-600 hover:bg-green-500"
                >
                  {posting === reply.id ? 'Posting...' : 'Post Reply'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

