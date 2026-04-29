'use client';

import { Button3D } from '../ui/Button';

interface SuccessScreenProps {
  productName: string;
  onViewCustomers: () => void;
  onStartOver: () => void;
}

export default function SuccessScreen({ productName, onViewCustomers, onStartOver }: SuccessScreenProps) {
  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {/* Success Icon */}
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto bg-orange-500/15 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Success Message */}
        <h1 className="text-3xl font-bold text-zinc-50 mb-4">
          Success!
        </h1>
        
        <p className="text-lg text-zinc-300 mb-8">
          Beno has found customers for &apos;{productName}&apos;
        </p>

        {/* Action Button */}
        <div className="mb-8">
          <Button3D
            onClick={onViewCustomers}
            className="w-full py-4 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all duration-200 flex items-center justify-center"
          >
            View Customers
            <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Button3D>
        </div>

        {/* What Happens Next */}
        <div className="bg-zinc-900 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-zinc-50 mb-3">
            What happens next?
          </h3>
          <div className="text-left space-y-3 text-sm text-zinc-300">
            <div className="flex items-start">
              <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
              <p>Beno will monitor relevant Reddit discussions</p>
            </div>
            <div className="flex items-start">
              <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
              <p>AI will generate helpful, contextual replies</p>
            </div>
            <div className="flex items-start">
              <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
              <p>Replies will be posted through the Managed Posting Network</p>
            </div>
            <div className="flex items-start">
              <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
              <p>Track performance and engagement in your dashboard</p>
            </div>
          </div>
        </div>

        {/* Additional Actions */}
        <div className="space-y-3">
          <button
            onClick={onStartOver}
            className="w-full py-3 border border-white/10 text-zinc-300 font-medium rounded-lg hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 transition-all duration-200"
          >
            Add Another Product
          </button>
          
          <p className="text-xs text-zinc-400">
            You can manage all your products and monitor their performance from your dashboard.
          </p>
        </div>

        {/* Support Info */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <p className="text-sm text-zinc-400">
            Need help? Contact us at{' '}
            <a href="mailto:support@redditoutreach.com" className="text-orange-600 hover:text-orange-700">
              support@redditoutreach.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
