'use client';

import { useState } from 'react';
import { Button3D } from '../ui/Button';
import { DiscussionItem, PublishReplyRequest } from '../../types/beno-workflow';

interface DiscussionsListProps {
  productId: string;
  discussions: DiscussionItem[];
  onRepliesPosted: () => void;
  onBack: () => void;
}

export default function DiscussionsList({ productId, discussions, onRepliesPosted, onBack }: DiscussionsListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSelect = (id: number | string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handlePostReplies = async () => {
    if (selectedIds.size === 0) return;
    setPosting(true);
    setError(null);
    try {
      for (const item of discussions) {
        // naive unique ID pick (assuming index or some id field)
        const id = (item as any).id ?? discussions.indexOf(item);
        if (!selectedIds.has(id)) continue;

        const req: PublishReplyRequest = {
          user_id: 'demo', // TODO: hook into auth
          pb_reply_id: id.toString(),
          comment_text: item.comment ?? 'Thanks for sharing!',
          product_id: productId,
          post_url: (item as any).url ?? '',
        };
        await fetch('/api/beno/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        });
      }
      onRepliesPosted();
    } catch (e) {
      console.error('[DiscussionsList] post replies error', e);
      setError((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-4xl w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Select Reddit posts to engage</h1>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 mb-4 rounded-lg text-center text-sm">{error}</div>
        )}

        <div className="space-y-4 mb-8">
          {discussions.map((d, idx) => {
            const id = (d as any).id ?? idx;
            const selected = selectedIds.has(id);
            return (
              <div
                key={id}
                onClick={() => toggleSelect(id)}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${selected ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'}`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-gray-900">{d.comment?.slice(0, 120) || 'Reddit post'}</h3>
                    <p className="text-sm text-gray-500 mt-1">Relevance: {(d.relevance_score * 100).toFixed(0)}%</p>
                  </div>

                  <div className={`w-5 h-5 rounded-full border-2 ${selected ? 'bg-orange-500 border-orange-500' : 'border-gray-300'}`} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={onBack}
            className="px-8 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200"
            disabled={posting}
          >
            Back
          </button>
          <Button3D
            onClick={handlePostReplies}
            disabled={selectedIds.size === 0 || posting}
            className="px-8 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {posting ? 'Posting...' : 'Generate & Post Replies'}
          </Button3D>
        </div>
      </div>
    </div>
  );
}
