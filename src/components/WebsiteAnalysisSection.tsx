'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button3D } from './ui/Button';

export default function WebsiteAnalysisSection() {
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleAnalyze = async () => {
    if (!url.trim()) {
      setError('Please enter a valid website URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      // Navigate to the Discussion Engagement tab in dashboard
      // The user will need to be logged in to access this
      router.push('/dashboard?tab=discussion-engagement&url=' + encodeURIComponent(url));
    } catch (err) {
      setError('Failed to start analysis. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAnalyze();
    }
  };

  return (
    <div className="bg-gray-800 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-6">
            Start Your Reddit Outreach Journey
          </h2>
          <p className="text-lg leading-8 text-gray-300 max-w-2xl mx-auto">
            Enter your website URL and our AI will analyze it to create a personalized Reddit engagement strategy
          </p>
        </div>

        <div className="bg-gray-700/40 rounded-2xl p-8 border border-gray-600/30 backdrop-blur-lg">
          {/* URL Input */}
          <div className="mb-8">
            <label htmlFor="website-url" className="block text-sm font-medium text-purple-300 mb-3">
              Your Website URL
            </label>
            <div className="flex gap-3">
              <input
                type="url"
                id="website-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="https://yourwebsite.com"
                className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                disabled={isAnalyzing}
              />
              <Button3D
                onClick={handleAnalyze}
                disabled={isAnalyzing || !url.trim()}
                className="px-8 py-3"
              >
                {isAnalyzing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Analyzing...
                  </div>
                ) : (
                  'Analyze Website'
                )}
              </Button3D>
            </div>
            {error && (
              <p className="mt-2 text-sm text-red-400">{error}</p>
            )}
          </div>

          {/* Outreach Method Selection */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Discussion Engagement Option */}
            <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-600/30 hover:border-purple-500/50 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">Discussion Engagement</h3>
              </div>
              <p className="text-gray-300 mb-4">
                AI finds relevant Reddit discussions and posts helpful replies using your managed accounts. 
                Perfect for building brand awareness and driving organic traffic.
              </p>
              <ul className="text-sm text-gray-400 space-y-2 mb-6">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  AI-powered relevance scoring
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  Public discussion replies
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  No personal account risk
                </li>
              </ul>
            </div>

            {/* Private Messaging Option */}
            <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-600/30 hover:border-purple-500/50 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">Private Messaging</h3>
              </div>
              <p className="text-gray-300 mb-4">
                Send personalized private messages to Reddit users based on their posts and activity. 
                Ideal for direct outreach and lead generation campaigns.
              </p>
              <ul className="text-sm text-gray-400 space-y-2 mb-6">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  Targeted user outreach
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  Custom message templates
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  Automated scheduling
                </li>
              </ul>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <h4 className="text-blue-400 font-semibold mb-2">How It Works</h4>
                <p className="text-sm text-gray-300">
                  Enter your website URL above and click "Analyze Website". Our AI will scrape your website, 
                  generate a product description, help you select customer segments, and identify relevant Reddit 
                  subreddits. Then you can choose between Discussion Engagement (public replies) or Private Messaging 
                  (direct outreach). Both options use your managed Reddit accounts for safety.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 