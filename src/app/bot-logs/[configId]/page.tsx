'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import LogViewer from '../../../components/LogViewer';

export default function BotLogsPage({ params }: { params: { configId: string } }) {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [botInfo, setBotInfo] = useState<{ subreddit: string; isActive: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Redirect if not authenticated
    if (isLoaded && !user) {
      router.push('/sign-in');
    }
  }, [isLoaded, user, router]);

  useEffect(() => {
    const fetchBotInfo = async () => {
      if (!params.configId) return;
      
      try {
        setIsLoading(true);
        const response = await fetch(`/api/reddit/scan-config?id=${params.configId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch bot information');
        }
        
        const data = await response.json();
        setBotInfo(data.config || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch bot information');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBotInfo();
  }, [params.configId]);

  const handleBack = () => {
    router.push('/dashboard');
  };

  if (!isLoaded || !user) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Bot Logs</h1>
          {botInfo && (
            <div className="bg-gray-800 p-3 rounded-lg flex items-center justify-between mb-4">
              <div>
                <span className="text-gray-400 mr-2">Subreddit:</span>
                <span className="text-indigo-400 font-medium">r/{botInfo.subreddit}</span>
              </div>
              <div>
                <span className="text-gray-400 mr-2">Status:</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${botInfo.isActive ? 'bg-green-900/50 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                  {botInfo.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          )}
          
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
          ) : error ? (
            <div className="bg-red-900/30 border border-red-800 p-4 rounded-lg text-center">
              <p className="text-red-400">{error}</p>
              <button 
                onClick={handleBack}
                className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          ) : (
            <LogViewer 
              userId={user.id} 
              configIdFilter={params.configId}
              showBackButton={true}
              onBack={handleBack}
            />
          )}
        </div>
      </div>
    </div>
  );
}
