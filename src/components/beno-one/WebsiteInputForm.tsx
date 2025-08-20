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
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Let Beno AI find customers for your project
          </h1>
          <p className="text-gray-600">
            Start by entering your website URL below
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* URL Input */}
          <div>
            <label htmlFor="url" className="sr-only">
              Website URL
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter your project url"
              className="w-full px-4 py-3 border-2 border-orange-400 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
              disabled={isLoading}
            />
          </div>

          {/* Helper Text */}
          <p className="text-sm text-gray-500 text-center">
            Better to add a website here. But it can be an App Store page or a Blog
          </p>

          {/* Terms Checkbox */}
          <div className="flex items-center justify-center">
            <input
              id="terms"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
              disabled={isLoading}
            />
            <label htmlFor="terms" className="ml-2 text-sm text-gray-700">
              I accept{' '}
              <a href="/terms" className="font-semibold underline text-orange-600 hover:text-orange-700">
                terms and conditions
              </a>
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <Button3D
            type="submit"
            disabled={isLoading || !acceptedTerms}
            className="w-full py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>Logged in as: {user.emailAddresses[0]?.emailAddress}</p>
          </div>
        )}
      </div>
    </div>
  );
} 