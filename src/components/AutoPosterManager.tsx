'use client';

import React, { useState, useEffect } from 'react';
import { WebsiteConfig } from '../lib/relevanceFiltering';
import { useUser } from '@clerk/nextjs';

interface AutoPosterStatus {
  isRunning: boolean;
  nextPostTime: Date | null;
  postsToday: number;
  lastPostResult: string | null;
  currentWebsiteConfig: WebsiteConfig | null;
}

interface AutoPosterManagerProps {
  websiteConfigs: WebsiteConfig[];
  onRefreshConfigs?: () => void;
}

export default function AutoPosterManager({ websiteConfigs, onRefreshConfigs }: AutoPosterManagerProps) {
  const { user } = useUser();
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [status, setStatus] = useState<AutoPosterStatus>({
    isRunning: false,
    nextPostTime: null,
    postsToday: 0,
    lastPostResult: null,
    currentWebsiteConfig: null
  });
  const [isPolling, setIsPolling] = useState(false);
  const [postingStats, setPostingStats] = useState({
    postsToday: 0,
    totalPosts: 0,
    lastPostTime: null as string | null
  });
  const [showTabWarning, setShowTabWarning] = useState(false);

  useEffect(() => {
    // Load posting stats on component mount
    loadPostingStats();
  }, []);

  // Real-time status polling
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const pollStatus = async () => {
      if (!selectedConfigId || !isPolling) return;

      try {
        const response = await fetch(`/api/auto-poster/status?websiteConfigId=${selectedConfigId}`);
        if (response.ok) {
          const statusData = await response.json();
          setStatus(prev => ({
            ...prev,
            isRunning: statusData.isRunning,
            nextPostTime: statusData.nextPostTime ? new Date(statusData.nextPostTime) : null,
            postsToday: statusData.postsToday,
            lastPostResult: statusData.lastPostResult,
            currentWebsiteConfig: statusData.currentWebsiteConfig
          }));
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
    };

    if (isPolling && selectedConfigId) {
      pollInterval = setInterval(pollStatus, 3000); // Poll every 3 seconds
      pollStatus(); // Initial poll
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [selectedConfigId, isPolling]);

  useEffect(() => {
    // Warn user before closing tab if auto-poster is running
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status.isRunning) {
        e.preventDefault();
        e.returnValue = 'Auto-poster is running. Are you sure you want to close this tab?';
        return e.returnValue;
      }
    };

    if (status.isRunning) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [status.isRunning]);

  const loadPostingStats = async () => {
    try {
      const response = await fetch('/api/posted-discussions?action=stats');
      if (response.ok) {
        const stats = await response.json();
        setPostingStats(stats);
      }
    } catch (error) {
      console.error('Error loading posting stats:', error);
    }
  };

  const handleStart = async () => {
    if (!selectedConfigId) {
      alert('Please select a website configuration first');
      return;
    }

    const selectedConfig = websiteConfigs.find(config => config.id === selectedConfigId);
    if (!selectedConfig) {
      alert('Selected website configuration not found');
      return;
    }

    try {
      const response = await fetch('/api/auto-poster/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          websiteConfigId: selectedConfigId,
          intervalMinutes: 30 
        })
      });

      if (response.ok) {
        setIsPolling(true); // Start polling for status updates
        setStatus(prev => ({
          ...prev,
          isRunning: true,
          currentWebsiteConfig: selectedConfig,
          nextPostTime: new Date(Date.now() + 30 * 60 * 1000)
        }));
        setShowTabWarning(true);
      } else {
        alert('Failed to start auto-poster');
      }
    } catch (error) {
      console.error('Error starting auto-poster:', error);
      alert('Failed to start auto-poster');
    }
  };

  const handleStop = async () => {
    try {
      const response = await fetch('/api/auto-poster/stop', {
        method: 'POST'
      });

      if (response.ok) {
        setIsPolling(false); // Stop polling
        setStatus(prev => ({
          ...prev,
          isRunning: false,
          currentWebsiteConfig: null,
          nextPostTime: null
        }));
        setShowTabWarning(false);
      }
    } catch (error) {
      console.error('Error stopping auto-poster:', error);
    }
  };

  const formatNextPostTime = (nextPostTime: Date | null) => {
    if (!nextPostTime) return 'Not scheduled';
    
    const now = new Date();
    const diff = nextPostTime.getTime() - now.getTime();
    
    if (diff <= 0) return 'Now';
    
    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return `${minutes}m ${seconds}s`;
  };

  const formatLastPostTime = (lastPostTime: string | null) => {
    if (!lastPostTime) return 'Never';
    
    const date = new Date(lastPostTime);
    return date.toLocaleString();
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Auto-Poster</h2>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${status.isRunning ? 'bg-green-500' : 'bg-gray-400'}`}></div>
          <span className="text-sm font-medium">
            {status.isRunning ? 'Running' : 'Stopped'}
          </span>
        </div>
      </div>

      {showTabWarning && status.isRunning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Keep This Tab Open!
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>The auto-poster is running in this browser tab. Closing this tab will stop the auto-posting process.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{postingStats.postsToday}</div>
          <div className="text-sm text-blue-800">Posts Today</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600">{postingStats.totalPosts}</div>
          <div className="text-sm text-green-800">Total Posts</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-sm font-medium text-purple-600">
            {formatNextPostTime(status.nextPostTime)}
          </div>
          <div className="text-sm text-purple-800">Next Post In</div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="website-config" className="block text-sm font-medium text-gray-700 mb-2">
            Website Configuration
          </label>
          <select
            id="website-config"
            value={selectedConfigId}
            onChange={(e) => setSelectedConfigId(e.target.value)}
            disabled={status.isRunning}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          >
            <option value="">Select a website configuration...</option>
            {websiteConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.website_url || config.url} - {config.website_description?.substring(0, 50) || config.description?.substring(0, 50) || 'No description'}...
              </option>
            ))}
          </select>
        </div>

        <div className="flex space-x-4">
          <button
            onClick={handleStart}
            disabled={status.isRunning || !selectedConfigId}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Start Auto-Posting
          </button>
          <button
            onClick={handleStop}
            disabled={!status.isRunning}
            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Stop Auto-Posting
          </button>
        </div>

        {status.isRunning && (
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Current Status</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Website:</span> {status.currentWebsiteConfig?.website_url || status.currentWebsiteConfig?.url}
              </div>
              <div>
                <span className="font-medium">Interval:</span> Every 30 minutes
              </div>
              <div>
                <span className="font-medium">Next Post:</span> {formatNextPostTime(status.nextPostTime)}
              </div>
              <div>
                <span className="font-medium">Last Result:</span> 
                <span className={`ml-2 ${status.lastPostResult?.startsWith('✅') ? 'text-green-600' : status.lastPostResult?.startsWith('❌') ? 'text-red-600' : 'text-gray-600'}`}>
                  {status.lastPostResult || 'Waiting to start...'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 space-y-1">
          <p>• First post happens immediately, then every 30 minutes</p>
          <p>• Only one post per cycle to respect Reddit rate limits</p>
          <p>• Duplicate posts are automatically prevented</p>
          <p>• Keep this browser tab open while auto-posting is active</p>
          <p>• Last manual post: {formatLastPostTime(postingStats.lastPostTime)}</p>
        </div>
      </div>
    </div>
  );
}
