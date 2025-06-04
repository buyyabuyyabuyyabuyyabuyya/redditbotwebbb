'use client';

import { useState, useEffect } from 'react';
import { createClientSupabaseClient } from '../utils/supabase';

interface BotStatusDisplayProps {
  configId: string;
  subreddit: string;
  keywords: string[];
  scanInterval: number;
  refreshTrigger?: number;
  onStopBot?: (configId: string) => void;
}

export default function BotStatusDisplay({
  configId,
  subreddit,
  keywords,
  scanInterval,
  refreshTrigger = 0,
  onStopBot,
}: BotStatusDisplayProps) {
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const [nextScanTime, setNextScanTime] = useState<string | null>(null);
  const [postsScanned, setPostsScanned] = useState(0);
  const [matchesFound, setMatchesFound] = useState(0);
  const [messagesSent, setMessagesSent] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Function to fetch bot status - moved outside useEffect so it can be called from other functions
  const fetchBotStatus = async () => {
    try {
      setIsLoading(true);

      // Use the API endpoint to get config data instead of direct Supabase queries
      const configResponse = await fetch('/api/reddit/scan-config');
      const configData = await configResponse.json();

      if (!configResponse.ok) {
        throw new Error(configData.error || 'Failed to load configurations');
      }

      // Find the specific config we're looking for
      const config = configData.configs?.find((c: any) => c.id === configId);

      if (config?.last_scan_time) {
        setLastScanTime(config.last_scan_time);

        // Calculate next scan time
        const lastScan = new Date(config.last_scan_time);
        const nextScan = new Date(
          lastScan.getTime() + scanInterval * 60 * 1000
        );
        setNextScanTime(nextScan.toISOString());

        // Calculate time left until next scan
        const now = new Date();
        const timeLeftMs = nextScan.getTime() - now.getTime();
        setTimeLeft(Math.max(0, Math.floor(timeLeftMs / 1000)));
      }

      // Use the API endpoint to get message count
      const messagesResponse = await fetch(
        `/api/reddit/messages?subreddit=${encodeURIComponent(subreddit)}&count=true`
      );
      const messagesData = await messagesResponse.json();

      if (messagesResponse.ok) {
        setMessagesSent(messagesData.count || 0);
      }

      // Simulate some stats for now (in a real app, you'd track these)
      setPostsScanned(Math.floor(Math.random() * 50) + 10);
      setMatchesFound(Math.floor(Math.random() * 10) + 1);
    } catch (err) {
      console.error('Error fetching bot status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch bot status on component mount and when refreshTrigger changes
  // Need to use useCallback to avoid dependency issues
  useEffect(() => {
    fetchBotStatus();

    // Set up interval to update time left
    const interval = setInterval(() => {
      if (timeLeft !== null && timeLeft > 0) {
        setTimeLeft(timeLeft - 1);
      } else if (nextScanTime) {
        // Recalculate time left if we have a next scan time
        const now = new Date();
        const next = new Date(nextScanTime);
        const timeLeftMs = next.getTime() - now.getTime();
        setTimeLeft(Math.max(0, Math.floor(timeLeftMs / 1000)));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    configId,
    subreddit,
    scanInterval,
    refreshTrigger,
    nextScanTime,
    timeLeft,
  ]);

  // Add a useEffect to trigger an initial scan if the bot was just started
  useEffect(() => {
    // If there's no last scan time, this might be a newly started bot
    // Automatically trigger a scan
    if (!lastScanTime && !isLoading && !isScanning) {
      triggerScan();
    }
  }, [lastScanTime, isLoading, isScanning]);

  // Format time left as mm:ss
  const formatTimeLeft = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format date for display
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  // Function to trigger an immediate scan
  const triggerScan = async () => {
    try {
      setIsScanning(true);
      setScanError(null);

      console.log(
        `Triggering scan for config ID: ${configId} for subreddit r/${subreddit}`
      );

      // Get the Reddit account credentials first to ensure we have everything needed
      const accountsResponse = await fetch('/api/reddit/accounts');
      if (!accountsResponse.ok) {
        throw new Error('Failed to fetch Reddit accounts');
      }

      const accountsData = await accountsResponse.json();
      console.log(
        `Found ${accountsData.accounts?.length || 0} Reddit accounts`
      );

      // Call the scan API endpoint
      const response = await fetch('/api/reddit/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configId,
        }),
      });

      // Log the raw response for debugging
      console.log(`Scan API response status: ${response.status}`);

      // Clone the response before reading it as JSON (for debugging)
      const responseClone = response.clone();
      const responseText = await responseClone.text();
      console.log(`Scan API raw response: ${responseText}`);

      // Parse the JSON response
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing response JSON:', parseError);
        throw new Error(
          `Invalid response format: ${responseText.substring(0, 100)}...`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error || `Failed to scan subreddit (Status: ${response.status})`
        );
      }

      console.log('Scan completed successfully:', data);

      // Log the scan manually to ensure we have a record
      try {
        await fetch('/api/reddit/bot-logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'scan_subreddit',
            status: 'success',
            subreddit: subreddit,
            config_id: configId,
            message: `Manually triggered scan of r/${subreddit}`,
          }),
        });
      } catch (logError) {
        console.error('Failed to log scan action:', logError);
      }

      // Update the last scan time and reset the timer
      setLastScanTime(new Date().toISOString());
      const nextScan = new Date(Date.now() + scanInterval * 60 * 1000);
      setNextScanTime(nextScan.toISOString());
      setTimeLeft(scanInterval * 60);

      // Refresh the stats
      fetchBotStatus();
    } catch (error) {
      console.error('Error scanning subreddit:', error);
      setScanError(
        error instanceof Error ? error.message : 'Failed to scan subreddit'
      );

      // Log the error
      try {
        await fetch('/api/reddit/bot-logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'scan_error',
            status: 'error',
            subreddit: subreddit,
            config_id: configId,
            error_message:
              error instanceof Error ? error.message : String(error),
          }),
        });
      } catch (logError) {
        console.error('Failed to log scan error:', logError);
      }
    } finally {
      setIsScanning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse bg-gray-800/50 rounded-lg p-4">
        <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-gray-700 rounded w-2/3"></div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-white">Bot Status for r/{subreddit}</h4>
        <div className="flex items-center space-x-2">
          <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
            Active
          </span>
          <button
            onClick={triggerScan}
            disabled={isScanning}
            className={`px-3 py-2 text-sm font-medium rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200 flex items-center ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-1"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V7z"
                clipRule="evenodd"
              />
            </svg>
            {isScanning ? 'Scanning...' : 'Scan Now'}
          </button>
          {onStopBot && (
            <button
              onClick={() => onStopBot(configId)}
              className="px-2 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white transition-colors duration-200 flex items-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3 w-3 mr-1"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
                  clipRule="evenodd"
                />
              </svg>
              Stop Bot
            </button>
          )}
        </div>
      </div>

      {/* Display scan error if any */}
      {scanError && (
        <div className="mt-2 p-2 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-sm">
          Error: {scanError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="text-gray-400">Keywords:</div>
        <div className="text-white">{keywords.join(', ')}</div>

        <div className="text-gray-400">Last scan:</div>
        <div className="text-white">{formatDate(lastScanTime)}</div>

        <div className="text-gray-400">Next scan:</div>
        <div className="text-white">{formatDate(nextScanTime)}</div>

        <div className="text-gray-400">Time until next scan:</div>
        <div className="text-white">
          {timeLeft !== null ? formatTimeLeft(timeLeft) : 'Unknown'}
        </div>
      </div>

      <div className="border-t border-gray-700 pt-3 mt-3">
        <h5 className="font-medium text-white mb-2">Scanning Statistics</h5>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900/50 rounded p-2 text-center">
            <div className="text-xl font-bold text-blue-400">
              {postsScanned}
            </div>
            <div className="text-xs text-gray-400">Posts Scanned</div>
          </div>
          <div className="bg-gray-900/50 rounded p-2 text-center">
            <div className="text-xl font-bold text-yellow-400">
              {matchesFound}
            </div>
            <div className="text-xs text-gray-400">Matches Found</div>
          </div>
          <div className="bg-gray-900/50 rounded p-2 text-center">
            <div className="text-xl font-bold text-green-400">
              {messagesSent}
            </div>
            <div className="text-xs text-gray-400">Messages Sent</div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-700 pt-3 mt-3">
        <h5 className="font-medium text-white mb-2">Bot Configuration</h5>
        <div className="text-sm space-y-1">
          <div className="flex">
            <span className="text-gray-400 w-32">Scan Interval:</span>
            <span className="text-white">{scanInterval} minutes</span>
          </div>
          <div className="flex">
            <span className="text-gray-400 w-32">Subreddit:</span>
            <span className="text-white">r/{subreddit}</span>
          </div>
          <div className="flex">
            <span className="text-gray-400 w-32">Keywords:</span>
            <span className="text-white">{keywords.join(', ')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
