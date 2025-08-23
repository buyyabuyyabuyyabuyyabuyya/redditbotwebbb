'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Textarea';
import { ExternalLink, MessageSquare, TrendingUp, Users } from 'lucide-react';

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
}

export default function RedditPoster({ productId }: RedditPosterProps) {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState<string | null>(null);
  const [editingReply, setEditingReply] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    fetchReplies();
  }, [productId]);

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
          <h2 className="text-2xl font-bold">Ready to Post</h2>
          <p className="text-gray-600">
            {replies.length} replies ready for Reddit posting
          </p>
        </div>
        <Button onClick={fetchReplies} variant="secondary">
          Refresh
        </Button>
      </div>

      {replies.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No replies ready
            </h3>
            <p className="text-gray-600">
              Check back later for new validated replies to post.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {replies.map((reply) => (
            <Card key={reply.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg line-clamp-2">
                      {reply.post.title}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      <div className="flex items-center gap-4 text-sm">
                        <span>r/{reply.post.subreddit?.name}</span>
                        <span>by u/{reply.post.author}</span>
                        {reply.post.subreddit && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {reply.post.subreddit.followers.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getStatusColor(reply.status)}>
                      {reply.status.replace(/_/g, ' ')}
                    </Badge>
                    <a
                      href={`https://reddit.com${reply.post.link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-4">
                  {/* Original Post Preview */}
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-700 line-clamp-3">
                      {reply.post.body}
                    </p>
                  </div>

                  {/* Reply Text */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Your Reply:</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {reply.relevanceScore}% relevance
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {reply.validationScore}% validation
                        </Badge>
                      </div>
                    </div>
                    
                    {editingReply === reply.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="min-h-[100px]"
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
                      <div 
                        className="bg-blue-50 p-3 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
                        onClick={() => handleEdit(reply)}
                      >
                        <p className="text-sm">{reply.text}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Click to edit
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => handlePost(reply)}
                      disabled={posting === reply.id || editingReply === reply.id}
                      className="flex-1"
                    >
                      {posting === reply.id ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Posting...
                        </>
                      ) : (
                        'Post to Reddit'
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleEdit(reply)}
                      disabled={posting === reply.id}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
