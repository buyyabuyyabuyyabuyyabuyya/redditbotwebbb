'use client';

import { useState } from 'react';

export default function StripeConfigGuide() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <h3 className="text-blue-300 font-medium">Stripe Duplicate Prevention Setup</h3>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-blue-400 hover:text-blue-300 text-sm"
        >
          {isOpen ? 'Hide' : 'Show'} Setup Guide
        </button>
      </div>
      
      {isOpen && (
        <div className="mt-4 space-y-4 text-sm text-blue-200">
          <div className="bg-blue-900/30 rounded-md p-3">
            <h4 className="font-medium text-blue-300 mb-2">🔧 Stripe Dashboard Configuration</h4>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                Go to{' '}
                <a 
                  href="https://dashboard.stripe.com/settings/checkout" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Stripe Checkout Settings
                </a>
              </li>
              <li>Enable <strong>"Redirect customers to customer portal"</strong></li>
              <li>
                Activate the{' '}
                <a 
                  href="https://dashboard.stripe.com/customer-portal" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Customer Portal
                </a>
              </li>
              <li>Enable the <strong>"Login link"</strong> in Customer Portal settings</li>
            </ol>
          </div>

          <div className="bg-green-900/30 rounded-md p-3">
            <h4 className="font-medium text-green-300 mb-2">✅ What This Prevents</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Customers creating multiple subscriptions with same email</li>
              <li>Duplicate billing for the same service</li>
              <li>Confusion from multiple active subscriptions</li>
              <li>Support tickets about billing issues</li>
            </ul>
          </div>

          <div className="bg-yellow-900/30 rounded-md p-3">
            <h4 className="font-medium text-yellow-300 mb-2">🎯 How It Works</h4>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Email Detection:</strong> Stripe automatically detects existing customers by email</li>
              <li><strong>Auto Redirect:</strong> Existing customers are sent to billing portal instead of checkout</li>
              <li><strong>Subscription Management:</strong> Users can upgrade/downgrade through portal</li>
              <li><strong>Code-Level Checks:</strong> Additional validation in your application code</li>
            </ul>
          </div>

          <div className="bg-purple-900/30 rounded-md p-3">
            <h4 className="font-medium text-purple-300 mb-2">🛡️ Multi-Layer Protection</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <strong className="text-purple-200">Stripe Level:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Dashboard settings</li>
                  <li>Customer portal redirect</li>
                  <li>Email-based detection</li>
                </ul>
              </div>
              <div>
                <strong className="text-purple-200">Code Level:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Pre-checkout validation</li>
                  <li>Active subscription checks</li>
                  <li>Automatic upgrades/downgrades</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
