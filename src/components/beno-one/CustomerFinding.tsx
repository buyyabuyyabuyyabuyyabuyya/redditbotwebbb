'use client';

import { useState, useEffect } from 'react';

import { DiscussionItem } from '../../types/beno-workflow';

interface CustomerFindingProps {
  url: string;
  name: string;
  description: string;
  segments: string[];
  onCustomersFound: (productId: string, discussions: DiscussionItem[], creatorId: string) => void;
  onBack: () => void;
}

export default function CustomerFinding({ url, name, description, segments, onCustomersFound, onBack }: CustomerFindingProps) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<'initializing' | 'analyzing' | 'scanning' | 'complete' | 'error'>('initializing');
  const [stepMessages] = useState({
    initializing: 'Initializing AI customer finding process...',
    analyzing: 'Analyzing your product and customer segments...',
    scanning: 'Scanning Reddit for relevant discussions...',
    scoring: 'Scoring discussion relevance...',
    finalizing: 'Finalizing customer discovery results...',
    complete: 'Customers found successfully!'
  });

  useEffect(() => {
    async function run() {
      try {
        // 1. Create product in Beno
        setCurrentStep('analyzing');
        setProgress(20);
        const createRes = await fetch('/api/beno/product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name || description.substring(0, 80),
            description,
            product_url: (() => {
              try {
                const u = new URL(url.startsWith('http') ? url : `https://${url}`);
                return u.hostname;
              } catch {
                return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
              }
            })()
          }),
        });
        const createData = await createRes.json(); // { product_id, r_code }

        // 2. Create promoting_product record first to get creator ID
        setProgress(35);
        let creatorId = 'demo';
        try {
          const promotingRes = await fetch('/api/beno/promoting-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name || description.substring(0, 80),
              url,
              description,
            }),
          });
          const promotingData = await promotingRes.json();
          if (promotingRes.ok) {
            creatorId = promotingData.creator || creatorId;
            window.dispatchEvent(new Event('campaignsUpdated'));
          } else {
            console.warn('[CustomerFinding] promoting-product error', promotingData);
          }
        } catch (e) {
          console.warn('[CustomerFinding] promoting-product creation failed', e);
        }
        if (!createRes.ok) throw new Error(createData.error || 'Failed to create product');

        // 3. Trigger Beno replies endpoint (required before discussions)
        try {
          await fetch(`/api/beno/replies?productId=${createData.product_id}`);
        } catch (e) {
          console.warn('[CustomerFinding] non-fatal: replies endpoint failed', e);
        }

        // 4. Poll discussions until items available or timeout (~30s)
        setCurrentStep('scanning');
        setProgress(60);
        let discData: any = { items: [] };
        const maxAttempts = 6;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const res = await fetch(`/api/beno/discussions?productId=${createData.product_id}`);
          discData = await res.json();
          if (res.ok && Array.isArray(discData.items) && discData.items.length > 0) {
            break;
          }
          // wait 5s before next try
          await new Promise(r => setTimeout(r, 5000));
          // update progress slightly
          setProgress(p => Math.min(90, p + 5));
        }

        // (moved promoting_product creation earlier)
        try {
          /* promoting_product creation already done above */
/* await fetch('/api/beno/promoting-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name || description.substring(0, 80),
              url,
              description,
            }),
          });
          // notify dashboard to refresh campaigns list
          */
        } catch (e) {
          console.warn('[CustomerFinding] promoting-product creation failed', e);
        }

        // 5. Done
        setProgress(100);
        setCurrentStep('complete');
        setTimeout(() => onCustomersFound(createData.product_id, (discData.items || []) as DiscussionItem[], creatorId), 1200);
      } catch (e) {
        console.error('[CustomerFinding] error', e);
        setCurrentStep('error');
      }
    }
    run();
  }, [url, name, description, segments, onCustomersFound]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {/* Progress Circle */}
        <div className="relative mb-8">
          <div className="w-32 h-32 mx-auto relative">
            {/* Background circle */}
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#f3f4f6"
                strokeWidth="2"
              />
              {/* Progress circle */}
              <path
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#f97316"
                strokeWidth="2"
                strokeDasharray={`${progress * 1.131}, 100`}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            
            {/* Progress text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-gray-900">{progress}%</span>
            </div>
          </div>
        </div>

        {/* Main Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Finding your customers
        </h1>

        {/* Subtitle */}
        <p className="text-lg text-gray-600 mb-8 flex items-center justify-center">
          <svg className="w-6 h-6 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
          Finding potential customers
        </p>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-8">
          <div 
            className="bg-orange-500 h-2 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        {/* Progress Text */}
        <p className="text-sm text-gray-500 mb-8">
          {progress}% complete
        </p>

        {/* Current Step Message */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-8">
          <div className="flex items-center justify-center">
            <svg className="w-5 h-5 text-orange-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-orange-800 font-medium">
              {stepMessages[currentStep as keyof typeof stepMessages]}
            </span>
          </div>
        </div>

        {/* Back Button (only show during initial steps) */}
        {progress < 50 && (
          <button
            onClick={onBack}
            className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200"
          >
            Back
          </button>
        )}

        {/* Loading Animation */}
        {progress < 100 && (
          <div className="mt-8">
            <div className="flex justify-center space-x-2">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        )}

        {/* Success Message */}
        {progress === 100 && (
          <div className="mt-8">
            <div className="text-green-600 text-lg font-medium">
              ✓ Process completed successfully!
            </div>
            <p className="text-gray-600 text-sm mt-2">
              Redirecting to results...
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 