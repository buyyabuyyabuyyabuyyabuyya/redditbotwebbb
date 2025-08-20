'use client';

import { useState } from 'react';
import { Button3D } from '../ui/Button';

interface CustomerSegment {
  id: string;
  title: string;
  description: string;
  is_selected: boolean;
}

interface CustomerSegmentsProps {
  onSegmentsSelected: (segments: string[]) => void;
  onBack: () => void;
}

export default function CustomerSegments({ onSegmentsSelected, onBack }: CustomerSegmentsProps) {
  const [segments, setSegments] = useState<CustomerSegment[]>([
    {
      id: '1',
      title: 'Digital marketers seeking scalable Reddit engagement tools',
      description: 'Professionals looking to automate and scale their Reddit marketing efforts',
      is_selected: false
    },
    {
      id: '2',
      title: 'Community managers aiming to automate subreddit interactions',
      description: 'Community managers who want to streamline their Reddit engagement',
      is_selected: false
    },
    {
      id: '3',
      title: 'Small businesses targeting niche audiences on Reddit',
      description: 'Businesses looking to reach specific communities on Reddit',
      is_selected: false
    },
    {
      id: '4',
      title: 'Social media agencies managing multiple Reddit campaigns',
      description: 'Agencies handling multiple client Reddit marketing campaigns',
      is_selected: false
    }
  ]);

  const toggleSegment = (id: string) => {
    setSegments(prev => 
      prev.map(segment => 
        segment.id === id 
          ? { ...segment, is_selected: !segment.is_selected }
          : segment
      )
    );
  };

  const handleContinue = () => {
    const selectedSegments = segments
      .filter(segment => segment.is_selected)
      .map(segment => segment.title);
    
    if (selectedSegments.length > 0) {
      onSegmentsSelected(selectedSegments);
    }
  };

  const selectedCount = segments.filter(s => s.is_selected).length;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Which customers better suit your product?
          </h1>
          <p className="text-gray-600">
            If all segments are relevant, you can choose all of them - it's ok
          </p>
        </div>

        {/* Customer Segments Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {segments.map((segment) => (
            <div
              key={segment.id}
              onClick={() => toggleSegment(segment.id)}
              className={`p-6 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
                segment.is_selected
                  ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  segment.is_selected
                    ? 'border-orange-500 bg-orange-500'
                    : 'border-gray-300'
                }`}>
                  {segment.is_selected && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className={`font-medium text-lg ${
                    segment.is_selected ? 'text-orange-900' : 'text-gray-900'
                  }`}>
                    {segment.title}
                  </h3>
                  <p className={`text-sm mt-1 ${
                    segment.is_selected ? 'text-orange-700' : 'text-gray-600'
                  }`}>
                    {segment.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Selection Summary */}
        {selectedCount > 0 && (
          <div className="text-center mb-6">
            <p className="text-sm text-gray-600">
              {selectedCount} customer segment{selectedCount !== 1 ? 's' : ''} selected
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={onBack}
            className="px-8 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200"
          >
            Back
          </button>
          <Button3D
            onClick={handleContinue}
            disabled={selectedCount === 0}
            className="px-8 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            Continue
          </Button3D>
        </div>

        {/* Help Text */}
        <div className="mt-8 text-center text-sm text-gray-500 max-w-2xl mx-auto">
          <p>
            These customer segments help our AI identify the most relevant Reddit discussions 
            where your product can provide genuine value. Choose the segments that best 
            represent your target audience.
          </p>
        </div>
      </div>
    </div>
  );
} 