'use client';

import { useState } from 'react';
import { Button3D } from '../ui/Button';
import { ScrapedWebsiteData } from '../../types/beno-one';

interface DescriptionReviewProps {
  scrapedData: ScrapedWebsiteData;
  onDescriptionConfirmed: (description: string) => void;
  onBack: () => void;
}

export default function DescriptionReview({ scrapedData, onDescriptionConfirmed, onBack }: DescriptionReviewProps) {
  const [description, setDescription] = useState(scrapedData.title || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateDescription = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/products/generate-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scraped_content: scrapedData,
          product_name: scrapedData.title
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate description');
      }

      if (data.success && data.description) {
        setDescription(data.description);
      } else {
        throw new Error('No description generated');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate description');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirm = () => {
    if (description.trim()) {
      onDescriptionConfirmed(description.trim());
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            How does this project description sound to you?
          </h1>
          <p className="text-gray-600">
            It helps our AI to understand your project better. Describe it like real users would - keep it simple.
          </p>
        </div>

        {/* Product Name Display */}
        <div className="bg-gray-50 p-6 rounded-lg mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              "{scrapedData.title || 'Untitled Project'}"
            </h2>
            <button
              onClick={onBack}
              className="text-gray-500 hover:text-gray-700 text-sm flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit
            </button>
          </div>
        </div>

        {/* Description Input */}
        <div className="mb-6">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            Project Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 resize-none"
            placeholder="Describe your project in simple terms..."
          />
          
          {/* Generate Button */}
          <div className="mt-3 flex justify-end">
            <button
              onClick={generateDescription}
              disabled={isGenerating}
              className="text-orange-600 hover:text-orange-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600 mr-2"></div>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate with AI
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={onBack}
            className="flex-1 py-3 px-6 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200"
          >
            Back
          </button>
          <Button3D
            onClick={handleConfirm}
            disabled={!description.trim()}
            className="flex-1 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            Continue
          </Button3D>
        </div>

        {/* Scraped Data Preview (Collapsible) */}
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
            View scraped website data
          </summary>
          <div className="mt-3 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
            <div className="space-y-2">
              {scrapedData.meta_description && (
                <div>
                  <strong>Meta Description:</strong> {scrapedData.meta_description}
                </div>
              )}
              {scrapedData.headings && scrapedData.headings.length > 0 && (
                <div>
                  <strong>Headings:</strong> {scrapedData.headings.slice(0, 3).join(', ')}
                  {scrapedData.headings.length > 3 && '...'}
                </div>
              )}
              {scrapedData.technologies && scrapedData.technologies.length > 0 && (
                <div>
                  <strong>Technologies:</strong> {scrapedData.technologies.join(', ')}
                </div>
              )}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
} 