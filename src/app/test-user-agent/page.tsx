'use client';

import { useState } from 'react';

export default function TestUserAgentPage() {
    const [userAgent, setUserAgent] = useState('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    const [accountId, setAccountId] = useState('');
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const testUserAgent = async () => {
        setLoading(true);
        setResult(null);

        try {
            const body: any = {};

            if (accountId.trim()) {
                body.accountId = accountId.trim();
            } else {
                body.userAgent = userAgent;
            }

            const response = await fetch('/api/reddit/test-user-agent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const data = await response.json();
            setResult({ status: response.status, data });
        } catch (error) {
            setResult({ error: error instanceof Error ? error.message : String(error) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">Test User Agent</h1>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-2">
                        Test with Account ID (optional)
                    </label>
                    <input
                        type="text"
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                        placeholder="Enter Reddit account ID to test its User Agent settings"
                        className="w-full p-2 border rounded"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        If provided, will test the User Agent configured for this account
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2">
                        Or Test Custom User Agent String
                    </label>
                    <textarea
                        value={userAgent}
                        onChange={(e) => setUserAgent(e.target.value)}
                        placeholder="Enter User Agent string to test"
                        className="w-full p-2 border rounded h-20"
                        disabled={!!accountId.trim()}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        {accountId.trim() ? 'Disabled when Account ID is provided' : 'Custom User Agent string to validate and test'}
                    </p>
                </div>

                <button
                    onClick={testUserAgent}
                    disabled={loading || (!userAgent.trim() && !accountId.trim())}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
                >
                    {loading ? 'Testing...' : 'Test User Agent'}
                </button>
            </div>

            {result && (
                <div className="mt-6 p-4 border rounded">
                    <h3 className="font-semibold mb-2">Result:</h3>
                    <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto">
                        {JSON.stringify(result, null, 2)}
                    </pre>
                </div>
            )}

            <div className="mt-8 p-4 bg-gray-50 rounded">
                <h3 className="font-semibold mb-2">How to use:</h3>
                <ul className="text-sm space-y-1">
                    <li><strong>Account ID Test:</strong> Enter a Reddit account ID to test its configured User Agent settings</li>
                    <li><strong>Custom Test:</strong> Enter any User Agent string to validate its format and parse its details</li>
                    <li><strong>Reddit API Test:</strong> If account credentials are available, it will actually test against Reddit's API</li>
                </ul>
            </div>
        </div>
    );
}