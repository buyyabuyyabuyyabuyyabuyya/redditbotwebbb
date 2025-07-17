'use client';

import { useState } from 'react';

interface LogArchiveButtonProps {
  configId?: string;
  subreddit?: string;
  onSuccess?: () => void;
}

export default function LogArchiveButton({
  configId,
  subreddit,
  onSuccess,
}: LogArchiveButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const triggerArchive = async () => {
    try {
      setIsLoading(true);

      // Call the archive endpoint
      const response = await fetch('/api/logs/archive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configId ? { configId, manual: true } : { manual: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to archive logs');
      }

      // Get the response data
      const data = await response.json();

      // Log the manual archival action to bot_logs for auditing
      try {
        // Only log to bot_logs directly if we have both configId and a valid subreddit (not placeholder)
      if (configId && subreddit && subreddit !== '_system') {
        console.log('[ARCHIVE-BUTTON] Logging manual archive', { subreddit, configId });
        await fetch('/api/reddit/bot-logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'archive_manual',
            status: 'success',
            subreddit: subreddit || '_system',
            config_id: configId,
            message: `Manual archive triggered${subreddit ? ` for r/${subreddit}` : ''}`,
          }),
        });
      }
      } catch (logErr) {
        console.error('Failed to log manual archive action:', logErr);
      }

      // Show success message
      alert('Logs archived successfully!');

      // Call the onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }

      // Refresh the page to see the changes
      window.location.reload();
    } catch (error) {
      console.error('Error archiving logs:', error);
      alert('Failed to archive logs. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={triggerArchive}
      disabled={isLoading}
      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? 'Archiving...' : 'Archive Logs Now'}
    </button>
  );
}
