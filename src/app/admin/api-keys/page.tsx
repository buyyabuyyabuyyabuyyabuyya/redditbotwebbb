'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';

export default function ApiKeysAdmin() {
  const { user } = useUser();
  const [apiKeys, setApiKeys] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!apiKeys.trim()) {
      setError('Please enter at least one API key');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setMessage('');
    
    try {
      // Split the text by newlines and filter out empty lines
      const keys = apiKeys.split('\n').filter(key => key.trim());
      
      const response = await fetch('/api/gemini/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keys,
          provider: 'gemini',
          model: 'gemini-2.0-flash-lite',
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage(`Successfully imported ${data.data.length} API keys`);
        setApiKeys(''); // Clear the textarea
      } else {
        setError(data.error || 'Failed to import API keys');
      }
    } catch (err) {
      setError('Error importing API keys');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-white">API Keys Management</h1>
      
      <div className="bg-gray-800 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4 text-white">Bulk Import API Keys</h2>
        
        {message && (
          <div className="bg-green-800 text-white p-3 rounded mb-4">
            {message}
          </div>
        )}
        
        {error && (
          <div className="bg-red-800 text-white p-3 rounded mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleImport}>
          <div className="mb-4">
            <label htmlFor="apiKeys" className="block text-sm font-medium mb-2 text-white">
              Paste API Keys (one per line)
            </label>
            <textarea
              id="apiKeys"
              rows={10}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
              value={apiKeys}
              onChange={(e) => setApiKeys(e.target.value)}
              placeholder="AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className={`px-4 py-2 rounded-md text-white ${
              isLoading
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? 'Importing...' : 'Import API Keys'}
          </button>
        </form>
      </div>
    </div>
  );
}
