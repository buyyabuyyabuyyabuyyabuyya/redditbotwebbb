'use client';

import { useState, useEffect } from 'react';
import { Button3D } from '../ui/Button';
import { ScrapedWebsiteData } from '../../types/beno-one';

interface DescriptionReviewProps {
  scrapedData: ScrapedWebsiteData;
  onDescriptionConfirmed: (description: string) => void;
  onBack: () => void;
}

export default function DescriptionReview({ scrapedData, onDescriptionConfirmed, onBack }: DescriptionReviewProps) {
  const [description, setDescription] = useState(scrapedData.description || scrapedData.title || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Disabled auto generation for now

  // Generate description disabled temporarily to avoid wrong endpoint
  const generateDescription = async () => {
    console.log('[DescriptionReview] generateDescription temporarily disabled');
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
            <div className="space-y-3">
              {scrapedData.title && (
                <div>
                  <strong>Page Title:</strong> {scrapedData.title}
                </div>
              )}
              {scrapedData.meta_description && (
                <div>
                  <strong>Meta Description:</strong> {scrapedData.meta_description}
                </div>
              )}
              {scrapedData.meta_keywords && scrapedData.meta_keywords.length > 0 && (
                <div>
                  <strong>Meta Keywords:</strong> {scrapedData.meta_keywords.join(', ')}
                </div>
              )}
              {scrapedData.headings && scrapedData.headings.length > 0 && (
                <div>
                  <strong>Main Headings:</strong> 
                  <div className="mt-1 ml-4 space-y-1">
                    {scrapedData.headings.slice(0, 5).map((heading, index) => (
                      <div key={index} className="text-gray-500">• {heading}</div>
                    ))}
                    {scrapedData.headings.length > 5 && (
                      <div className="text-gray-400">... and {scrapedData.headings.length - 5} more</div>
                    )}
                  </div>
                </div>
              )}
              {scrapedData.main_content && (
                <div>
                  <strong>Content Preview:</strong> 
                  <div className="mt-1 ml-4 text-gray-500">
                    {scrapedData.main_content.substring(0, 200)}...
                  </div>
                </div>
              )}
              {scrapedData.technologies && scrapedData.technologies.length > 0 && (
                <div>
                  <strong>Technologies Detected:</strong> {scrapedData.technologies.join(', ')}
                </div>
              )}
              {scrapedData.social_media && (
                <div>
                  <strong>Social Media:</strong>
                  <div className="mt-1 ml-4 space-y-1">
                    {Object.entries(scrapedData.social_media).map(([platform, link]) => 
                      link ? <div key={platform} className="text-gray-500">• {platform}: {link}</div> : null
                    )}
                  </div>
                </div>
              )}
              {scrapedData.links && scrapedData.links.length > 0 && (
                <div>
                  <strong>External Links:</strong> {scrapedData.links.length} links found
                </div>
              )}
              {scrapedData.images && scrapedData.images.length > 0 && (
                <div>
                  <strong>Images:</strong> {scrapedData.images.length} images found
                </div>
              )}
              {scrapedData.structured_data && (
                <div>
                  <strong>Structured Data:</strong>
                  <div className="mt-1 ml-4 text-gray-500">
                    <pre className="text-xs overflow-x-auto">
                      {JSON.stringify(scrapedData.structured_data, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              {scrapedData.scraped_at && (
                <div>
                  <strong>Scraped At:</strong> {new Date(scrapedData.scraped_at).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
} 