'use client';

import { useUserPlan } from '../hooks/useUserPlan';

interface UpgradePromptProps {
  showDetails?: boolean;
}

export default function UpgradePrompt({
  showDetails = false,
}: UpgradePromptProps) {
  const { plan, remaining, isProUser, loading } = useUserPlan();

  // Avoid showing banner until we know the plan for sure
  if (loading || isProUser) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-500/30 rounded-lg p-4 mb-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between">
        <div className="mb-4 md:mb-0">
          <h3 className="text-lg font-medium text-white flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2 text-amber-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zm7-10a1 1 0 01.707.293l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 8l-3.293-3.293A1 1 0 0112 2z"
                clipRule="evenodd"
              />
            </svg>
            Free Plan Limitations
          </h3>
          <p className="text-gray-300 mt-1">
            You're currently on the Free plan with {remaining} messages
            remaining.
          </p>
          {showDetails && (
            <ul className="mt-2 text-sm text-gray-300 list-disc list-inside">
              <li>Limited to 15 messages total</li>
              <li>Only 1 active bot at a time</li>
              <li>Basic support</li>
            </ul>
          )}
        </div>
        <a
          href="/pricing"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-gray-900"
        >
          Upgrade to Pro
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="ml-2 -mr-0.5 h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
