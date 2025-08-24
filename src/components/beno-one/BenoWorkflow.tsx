'use client';

import { useState } from 'react';
import RedditPoster from './RedditPoster';
import AutoPosterSettings from './AutoPosterSettings';
import { DiscussionItem } from '../../types/beno-workflow';
import { redditReplyService } from '../../lib/redditReplyService';

type WorkflowStep = 'input' | 'describe' | 'segments' | 'discussions' | 'auto-reply' | 'posting' | 'automation';

export default function BenoWorkflow() {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('input');
  const [url, setUrl] = useState<string>('');
  const [description, setDescription] = useState<any>(null);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [productId, setProductId] = useState<string>('');
  const [discussions, setDiscussions] = useState<DiscussionItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleUrlSubmit = async (inputUrl: string) => {
    setUrl(inputUrl);
    setLoading(true);
    try {
      const response = await fetch('/api/beno/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl })
      });
      const data = await response.json();
      setDescription(data);
      setCurrentStep('describe');
    } catch (error) {
      console.error('Failed to describe website:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDescriptionConfirm = () => {
    setCurrentStep('segments');
  };

  const handleSegmentsConfirm = (segments: string[]) => {
    setSelectedSegments(segments);
    setCurrentStep('discussions');
  };

  const handleDiscussionsFound = (id: string, foundDiscussions: DiscussionItem[]) => {
    setProductId(id);
    setDiscussions(foundDiscussions);
    setCurrentStep('posting');
  };

  const handleSetupAutomation = () => {
    setCurrentStep('automation');
  };

  const handleBack = () => {
    if (currentStep === 'automation') {
      setCurrentStep('posting');
    } else if (currentStep === 'posting') {
      setCurrentStep('auto-reply');
    } else if (currentStep === 'auto-reply') {
      setCurrentStep('discussions');
    } else if (currentStep === 'discussions') {
      setCurrentStep('segments');
    } else if (currentStep === 'segments') {
      setCurrentStep('describe');
    } else if (currentStep === 'describe') {
      setCurrentStep('input');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-white">AI-Powered Discussion Engagement</h1>
          <div className="flex items-center space-x-2 text-sm">
            <StepBadge step={1} current={currentStep} stepKey="input" label="URL" />
            <div className="w-4 h-px bg-gray-600"></div>
            <StepBadge step={2} current={currentStep} stepKey="describe" label="Analysis" />
            <div className="w-4 h-px bg-gray-600"></div>
            <StepBadge step={3} current={currentStep} stepKey="segments" label="Segments" />
            <div className="w-4 h-px bg-gray-600"></div>
            <StepBadge step={4} current={currentStep} stepKey="discussions" label="Discussions" />
            <div className="w-4 h-px bg-gray-600"></div>
            <StepBadge step={5} current={currentStep} stepKey="auto-reply" label="AI Reply" />
            <div className="w-4 h-px bg-gray-600"></div>
            <StepBadge step={6} current={currentStep} stepKey="posting" label="Manual" />
            <div className="w-4 h-px bg-gray-600"></div>
            <StepBadge step={7} current={currentStep} stepKey="automation" label="Auto" />
          </div>
        </div>
      </div>

      {/* Step content */}
      {currentStep === 'input' && (
        <URLInputStep onSubmit={handleUrlSubmit} loading={loading} />
      )}

      {currentStep === 'describe' && description && (
        <DescriptionStep 
          description={description}
          onConfirm={handleDescriptionConfirm}
          onBack={handleBack}
        />
      )}

      {currentStep === 'segments' && description && (
        <SegmentsStep 
          customerSegments={description.customer_segments || []}
          onConfirm={handleSegmentsConfirm}
          onBack={handleBack}
        />
      )}

      {currentStep === 'discussions' && (
        <DiscussionsStep
          url={url}
          description={description}
          selectedSegments={selectedSegments}
          onDiscussionsFound={handleDiscussionsFound}
          onBack={handleBack}
          onAutoReply={() => setCurrentStep('auto-reply')}
        />
      )}

      {currentStep === 'auto-reply' && (
        <AutoReplyStep
          discussions={discussions}
          onBack={handleBack}
          onContinue={() => setCurrentStep('posting')}
        />
      )}

      {currentStep === 'posting' && (
        <div className="bg-gray-800/70 rounded-xl p-6 border border-gray-700/50">
          <div className="mb-6 flex items-center justify-between">
            <button
              onClick={handleBack}
              className="text-purple-400 hover:text-purple-300 flex items-center"
            >
              ← Back to Discussions
            </button>
            <button
              onClick={handleSetupAutomation}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-all"
            >
              Setup Automation
            </button>
          </div>
          <RedditPoster
            productId={productId}
          />
        </div>
      )}

      {currentStep === 'automation' && (
        <AutoPosterSettings
          productId={productId}
          accountId={selectedAccountId}
        />
      )}
    </div>
  );
}

// Step Badge Component
function StepBadge({ step, current, stepKey, label }: { step: number; current: string; stepKey: string; label: string }) {
  const isActive = current === stepKey;
  const isCompleted = ['input', 'describe', 'segments', 'discussions', 'posting', 'automation'].indexOf(current) > ['input', 'describe', 'segments', 'discussions', 'posting', 'automation'].indexOf(stepKey);
  
  const stepClasses = isActive 
    ? 'bg-purple-600 text-white' 
    : isCompleted 
      ? 'bg-green-600 text-white' 
      : 'bg-gray-600 text-gray-300';

  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${stepClasses}`}>
      {step}
    </div>
  );
}

// URL Input Step
function URLInputStep({ onSubmit, loading }: { onSubmit: (url: string) => void; loading: boolean }) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  return (
    <div className="bg-gray-800/70 rounded-xl p-6 border border-gray-700/50">
      <h2 className="text-2xl font-bold text-white mb-6">Enter Your Website URL</h2>
      <p className="text-gray-300 mb-6">
        Our AI will analyze your website to understand your business and generate targeted discussion engagement strategies.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-purple-300 mb-2">
            Website URL *
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="https://yourwebsite.com"
            required
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg transition-colors"
        >
          {loading ? 'Analyzing...' : 'Analyze Website →'}
        </button>
      </form>
    </div>
  );
}

// Description Step
function DescriptionStep({ description, onConfirm, onBack }: { description: any; onConfirm: () => void; onBack: () => void }) {
  return (
    <div className="bg-gray-800/70 rounded-xl p-6 border border-gray-700/50">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Review Description</h2>
        <button onClick={onBack} className="text-purple-400 hover:text-purple-300">← Back</button>
      </div>
      
      <div className="space-y-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-purple-300 mb-2">Product Name</h3>
          <p className="text-white">{description.name}</p>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-purple-300 mb-2">Description</h3>
          <p className="text-gray-300">{description.description}</p>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-purple-300 mb-2">Relevance</h3>
          <p className="text-gray-300">{description.is_relevant ? 'Suitable for Reddit engagement' : 'May not be suitable'}</p>
        </div>
      </div>
      
      <button
        onClick={onConfirm}
        className="w-full bg-purple-600 hover:bg-purple-500 text-white py-3 px-4 rounded-lg transition-colors"
      >
        Continue to Customer Segments →
      </button>
    </div>
  );
}

// Segments Step
function SegmentsStep({ customerSegments, onConfirm, onBack }: { customerSegments: string[]; onConfirm: (segments: string[]) => void; onBack: () => void }) {
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);

  const toggleSegment = (segment: string) => {
    setSelectedSegments(prev => 
      prev.includes(segment) 
        ? prev.filter(s => s !== segment)
        : [...prev, segment]
    );
  };

  return (
    <div className="bg-gray-800/70 rounded-xl p-6 border border-gray-700/50">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Select Customer Segments</h2>
        <button onClick={onBack} className="text-purple-400 hover:text-purple-300">← Back</button>
      </div>
      
      <p className="text-gray-300 mb-6">
        Choose which customer segments best represent your target audience:
      </p>
      
      <div className="space-y-3 mb-6">
        {customerSegments.map((segment, index) => (
          <label key={index} className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedSegments.includes(segment)}
              onChange={() => toggleSegment(segment)}
              className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
            />
            <span className="text-white">{segment}</span>
          </label>
        ))}
      </div>
      
      <button
        onClick={() => onConfirm(selectedSegments)}
        disabled={selectedSegments.length === 0}
        className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg transition-colors"
      >
        Find Relevant Discussions →
      </button>
    </div>
  );
}

// Discussions Step
function DiscussionsStep({ url, description, selectedSegments, onDiscussionsFound, onBack, onAutoReply }: {
  url: string;
  description: any;
  selectedSegments: string[];
  onDiscussionsFound: (id: string, discussions: DiscussionItem[]) => void;
  onBack: () => void;
  onAutoReply: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [discussions, setDiscussions] = useState<DiscussionItem[]>([]);
  const [productId, setProductId] = useState('');

  const findDiscussions = async () => {
    setLoading(true);
    try {
      // Create product first
      const productRes = await fetch('/api/beno/product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: description.name,
          description: description.description,
          product_url: url
        })
      });
      const productData = await productRes.json();
      setProductId(productData.product_id);

      // Use custom Reddit discussions logic
      const { generateRedditSearchQueries, searchMultipleSubreddits } = await import('../../lib/redditService');
      
      // Generate search queries based on product description
      const queries = generateRedditSearchQueries(description.description, description.segments || []);
      
      // Search Reddit for relevant discussions
      const allDiscussions = [];
      for (const query of queries.slice(0, 3)) { // Limit to top 3 queries
        try {
          const discussions = await searchMultipleSubreddits(query, undefined, 3);
          allDiscussions.push(...discussions);
        } catch (error) {
          console.warn('Failed to search Reddit for query:', query, error);
        }
      }
      
      // Remove duplicates and keep Reddit data structure for display
      const uniqueDiscussions = allDiscussions
        .filter((discussion, index, self) => 
          index === self.findIndex(d => d.id === discussion.id)
        )
        .slice(0, 10)
        .map(discussion => ({
          // Keep original Reddit properties for display
          title: discussion.title,
          content: discussion.content,
          description: discussion.description,
          score: discussion.score,
          subreddit: discussion.subreddit,
          author: discussion.author,
          url: discussion.url,
          // Also include DiscussionItem format for compatibility
          raw_comment: discussion.content || discussion.title,
          engagement_metrics: {
            score: discussion.score,
            num_comments: discussion.num_comments
          },
          relevance_score: Math.min(100, Math.max(0, discussion.score * 2)),
          comment: discussion.content || discussion.title
        }));
      
      setDiscussions(uniqueDiscussions);
    } catch (error) {
      console.error('Failed to find discussions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    onDiscussionsFound(productId, discussions);
  };

  return (
    <div className="bg-gray-800/70 rounded-xl p-6 border border-gray-700/50">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Find Relevant Discussions</h2>
        <button onClick={onBack} className="text-purple-400 hover:text-purple-300">← Back</button>
      </div>
      
      {discussions.length === 0 ? (
        <div className="text-center">
          <p className="text-gray-300 mb-6">
            Ready to find Reddit discussions relevant to your selected customer segments.
          </p>
          <button
            onClick={findDiscussions}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white py-3 px-6 rounded-lg transition-colors"
          >
            {loading ? 'Searching...' : 'Find Discussions'}
          </button>
        </div>
      ) : (
        <div>
          <p className="text-green-400 mb-4">Found {discussions.length} relevant discussions!</p>
          <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
            {discussions.slice(0, 3).map((discussion, index) => (
              <div key={index} className="bg-gray-700/50 p-4 rounded-lg">
                <h4 className="text-white font-semibold mb-2">{(discussion as any).title || 'Discussion'}</h4>
                <p className="text-gray-300 text-sm mb-2">{((discussion as any).content || (discussion as any).description || '').substring(0, 200)}...</p>
                <div className="flex items-center space-x-4 text-xs text-gray-400">
                  <span>Score: {(discussion as any).score || 0}</span>
                  <span>Subreddit: r/{(discussion as any).subreddit || 'unknown'}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex space-x-4">
            <button
              onClick={onAutoReply}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 px-4 rounded-lg transition-colors"
            >
              Generate AI Replies →
            </button>
            <button
              onClick={handleContinue}
              className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-3 px-4 rounded-lg transition-colors"
            >
              Manual Posting →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Product Input Component
interface ProductInputProps {
  onSubmit: (data: {
    url: string;
    name: string;
    description: string;
    segments: string[];
  }) => void;
}

function ProductInput({ onSubmit }: ProductInputProps) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [segments, setSegments] = useState<string[]>(['']);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  const addSegment = () => {
    setSegments([...segments, '']);
  };

  const updateSegment = (index: number, value: string) => {
    const newSegments = [...segments];
    newSegments[index] = value;
    setSegments(newSegments);
  };

  const removeSegment = (index: number) => {
    setSegments(segments.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validSegments = segments.filter(s => s.trim());
    onSubmit({ url, name, description, segments: validSegments });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h2 className="text-2xl font-bold mb-6">Enter Your Product Details</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product URL *
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourproduct.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Awesome Product"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Description *
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what your product does and who it's for..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Customer Segments
          </label>
          <div className="space-y-2">
            {segments.map((segment, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={segment}
                  onChange={(e) => updateSegment(index, e.target.value)}
                  placeholder="e.g., Small business owners, Developers, Students..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {segments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSegment(index)}
                    className="px-3 py-2 text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addSegment}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              + Add another segment
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Reddit Account for Posting
          </label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            required
          >
            <option value="">Select Reddit Account</option>
            <option value="default">Default Account</option>
            {/* TODO: Load actual user accounts */}
          </select>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 font-medium"
          disabled={!selectedAccountId}
        >
          Start Customer Finding
        </button>
      </form>
    </div>
  );
}

// Auto Reply Step Component
function AutoReplyStep({ discussions, onBack, onContinue }: {
  discussions: DiscussionItem[];
  onBack: () => void;
  onContinue: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [tone, setTone] = useState<'helpful' | 'casual' | 'professional' | 'enthusiastic' | 'informative'>('helpful');
  const [maxLength, setMaxLength] = useState(500);
  const [keywords, setKeywords] = useState<string>('');
  const [results, setResults] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleGenerateReplies = async () => {
    if (!selectedAccountId) {
      alert('Please select a Reddit account first');
      return;
    }

    setLoading(true);
    setResults([]);
    setCurrentIndex(0);

    try {
      const keywordArray = keywords.split(',').map(k => k.trim()).filter(k => k);
      const postsToProcess = discussions.slice(0, 5); // Process first 5 discussions

      for (let i = 0; i < postsToProcess.length; i++) {
        const discussion = postsToProcess[i] as any;
        
        // Convert discussion to Reddit post format
        const post = {
          id: discussion.id || `post_${i}`,
          title: discussion.title || 'Discussion',
          selftext: discussion.content || discussion.description || '',
          subreddit: discussion.subreddit || 'unknown',
          score: discussion.score || 0,
          url: discussion.url || '',
          permalink: discussion.url || ''
        };

        const result = await redditReplyService.generateAndPostReply(post, {
          tone,
          maxLength,
          keywords: keywordArray,
          accountId: selectedAccountId
        });

        setResults(prev => [...prev, { post, result }]);
        setCurrentIndex(i + 1);

        // Small delay between requests
        if (i < postsToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      console.error('Error generating replies:', error);
      alert('Error generating replies. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800/70 rounded-xl p-6 border border-gray-700/50">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">AI Reply Generation</h2>
        <button onClick={onBack} className="text-purple-400 hover:text-purple-300">← Back</button>
      </div>

      {results.length === 0 ? (
        <div className="space-y-6">
          <p className="text-gray-300">
            Generate AI-powered replies for the found discussions and automatically post them to Reddit.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Reddit Account
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select an account...</option>
                <option value="account1">Reddit Account 1</option>
                <option value="account2">Reddit Account 2</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Reply Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as any)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="helpful">Helpful</option>
                <option value="casual">Casual</option>
                <option value="professional">Professional</option>
                <option value="enthusiastic">Enthusiastic</option>
                <option value="informative">Informative</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Max Length (characters)
              </label>
              <input
                type="number"
                value={maxLength}
                onChange={(e) => setMaxLength(parseInt(e.target.value) || 500)}
                min="100"
                max="1000"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="keyword1, keyword2, keyword3"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h3 className="text-white font-semibold mb-2">Discussions to Process ({discussions.length})</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {discussions.slice(0, 5).map((discussion, index) => (
                <div key={index} className="text-sm text-gray-300">
                  • {(discussion as any).title || 'Discussion'} (r/{(discussion as any).subreddit || 'unknown'})
                </div>
              ))}
              {discussions.length > 5 && (
                <div className="text-sm text-gray-400">...and {discussions.length - 5} more</div>
              )}
            </div>
          </div>

          <button
            onClick={handleGenerateReplies}
            disabled={loading || !selectedAccountId}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg transition-colors"
          >
            {loading ? `Generating Replies... (${currentIndex}/${Math.min(discussions.length, 5)})` : 'Generate & Post AI Replies'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-white">Reply Results</h3>
            <div className="text-sm text-gray-300">
              {results.filter(r => r.result.success).length} successful, {results.filter(r => !r.result.success).length} failed
            </div>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {results.map((item, index) => (
              <div key={index} className="bg-gray-700/50 p-4 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-white font-medium">{item.post.title}</h4>
                  <span className={`px-2 py-1 rounded text-xs ${
                    item.result.success ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  }`}>
                    {item.result.success ? 'Posted' : 'Failed'}
                  </span>
                </div>
                <p className="text-gray-400 text-sm mb-2">r/{item.post.subreddit}</p>
                {item.result.generatedReply && (
                  <div className="bg-gray-800 p-3 rounded text-sm text-gray-300 mb-2">
                    <strong>Generated Reply:</strong><br />
                    {item.result.generatedReply.substring(0, 200)}...
                  </div>
                )}
                {item.result.error && (
                  <p className="text-red-400 text-sm">Error: {item.result.error}</p>
                )}
                {item.result.commentUrl && (
                  <a href={item.result.commentUrl} target="_blank" rel="noopener noreferrer" 
                     className="text-blue-400 hover:text-blue-300 text-sm">
                    View Comment →
                  </a>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={onContinue}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white py-3 px-4 rounded-lg transition-colors"
          >
            Continue to Manual Posting →
          </button>
        </div>
      )}
    </div>
  );
}
