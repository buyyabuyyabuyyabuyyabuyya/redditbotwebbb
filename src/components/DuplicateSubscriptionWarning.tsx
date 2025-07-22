'use client';

import { useState, useEffect } from 'react';

interface Customer {
  id: string;
  email: string;
  created: string;
  subscriptions: Array<{
    id: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    plan_name: string;
    amount: number;
  }>;
}

interface DuplicateInfo {
  hasDuplicates: boolean;
  customerCount: number;
  customers: Customer[];
}

export default function DuplicateSubscriptionWarning() {
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkForDuplicates();
  }, []);

  const checkForDuplicates = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/stripe/check-duplicates');
      
      if (!response.ok) {
        throw new Error('Failed to check for duplicates');
      }
      
      const data = await response.json();
      setDuplicateInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-400"></div>
          <span className="text-yellow-400 text-sm">Checking for duplicate subscriptions...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="text-red-400 text-sm">Error checking subscriptions: {error}</span>
        </div>
      </div>
    );
  }

  if (!duplicateInfo?.hasDuplicates) {
    return null; // No duplicates, don't show anything
  }

  const activeSubscriptions = duplicateInfo.customers.flatMap(customer => 
    customer.subscriptions.filter(sub => sub.status === 'active')
  );

  return (
    <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6 mb-6">
      <div className="flex items-start gap-3">
        <svg className="w-6 h-6 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <div className="flex-1">
          <h3 className="text-red-400 font-semibold text-lg mb-2">
            ⚠️ Duplicate Subscriptions Detected
          </h3>
          <p className="text-red-300 mb-4">
            We found {duplicateInfo.customerCount} Stripe customer accounts with your email address. 
            You have {activeSubscriptions.length} active subscription{activeSubscriptions.length !== 1 ? 's' : ''}.
          </p>
          
          <div className="space-y-3 mb-4">
            {duplicateInfo.customers.map((customer, index) => (
              <div key={customer.id} className="bg-red-800/30 rounded-md p-3">
                <div className="text-sm text-red-200 mb-2">
                  <strong>Customer #{index + 1}:</strong> {customer.id}
                  <br />
                  <strong>Created:</strong> {new Date(customer.created).toLocaleDateString()}
                </div>
                
                {customer.subscriptions.length > 0 ? (
                  <div className="space-y-2">
                    {customer.subscriptions.map(sub => (
                      <div key={sub.id} className="text-xs text-red-100 bg-red-900/40 rounded p-2">
                        <div className="flex justify-between items-center">
                          <span>
                            <strong>{sub.plan_name}</strong> - ${(sub.amount / 100).toFixed(2)}/month
                          </span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            sub.status === 'active' 
                              ? 'bg-green-600 text-white' 
                              : 'bg-gray-600 text-gray-200'
                          }`}>
                            {sub.status}
                          </span>
                        </div>
                        <div className="text-red-200 mt-1">
                          Period: {new Date(sub.current_period_start).toLocaleDateString()} - {new Date(sub.current_period_end).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-red-200">No subscriptions found</div>
                )}
              </div>
            ))}
          </div>

          <div className="bg-red-800/40 rounded-md p-3">
            <h4 className="text-red-300 font-medium mb-2">Action Required:</h4>
            <ul className="text-red-200 text-sm space-y-1 list-disc list-inside">
              <li>Contact support to merge or cancel duplicate customer accounts</li>
              <li>You may be charged multiple times for the same service</li>
              <li>Only one subscription should be active at a time</li>
            </ul>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={checkForDuplicates}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-colors"
            >
              Refresh Check
            </button>
            <a
              href="mailto:support@yourapp.com?subject=Duplicate Stripe Subscriptions&body=I have duplicate Stripe customer accounts that need to be resolved."
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-md transition-colors"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
