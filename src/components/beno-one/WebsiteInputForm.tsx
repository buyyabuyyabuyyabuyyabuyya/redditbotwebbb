'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Button3D } from '../ui/Button';

interface WebsiteInputFormProps {
  onWebsiteSubmitted: (url: string, scrapedData: any) => void;
  onNext: () => void;
}

export default function WebsiteInputForm({ onWebsiteSubmitted, onNext }: WebsiteInputFormProps) {
  const { user } = useUser();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      setError('Please enter a website URL');
      return;
    }

    if (!acceptedTerms) {
      setError('Please accept the terms and conditions');
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/products/scrape-website', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to scrape website');
      }

      if (data.success && data.data) {
        onWebsiteSubmitted(url.trim(), data.data);
        onNext();
      } else {
        throw new Error('No data received from scraping service');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">
            Let AI find customers for your project
          </h1>
          <p className="text-gray-300">
            We'll analyze your website and find the best customer segments
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* URL Input */}
          <div>
            <label htmlFor="url" className="block text-sm font-medium text-purple-300 mb-2">
              Website URL
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourwebsite.com"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
              disabled={isLoading}
            />
          </div>

          {/* Helper Text */}
          <p className="text-sm text-gray-400 text-center">
            Better to add a website here. But it can be an App Store page or a Blog
          </p>

          {/* Terms Checkbox */}
          <div className="flex items-center justify-center">
            <input
              id="terms"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-600 rounded bg-gray-700"
              disabled={isLoading}
            />
            <label htmlFor="terms" className="ml-2 text-sm text-gray-300">
              I accept{' '}
              <a href="/terms" className="font-semibold underline text-purple-400 hover:text-purple-300">
                terms and conditions
              </a>
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-red-400 text-sm text-center bg-red-900/20 border border-red-500/30 p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <Button3D
            type="submit"
            disabled={isLoading || !acceptedTerms}
            className="w-full py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Scraping website...
              </div>
            ) : (
              'Continue'
            )}
          </Button3D>
        </form>

        {/* User Info */}
        {user && (
          <div className="mt-8 text-center text-sm text-gray-400">
            <p>Logged in as: {user.emailAddresses[0]?.emailAddress}</p>
          </div>
        )}
      </div>
    </div>
  );
} 