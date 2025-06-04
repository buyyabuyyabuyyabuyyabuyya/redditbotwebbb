'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface AutoScanPollerProps {
  configId: string;
  userId: string;
  initialScanInterval: number; // in minutes
  onScanTriggered?: () => void;
  onError?: (error: Error) => void;
}

export default function AutoScanPoller({
  configId,
  userId,
  initialScanInterval,
  onScanTriggered,
  onError
}: AutoScanPollerProps) {
  const [isPolling, setIsPolling] = useState<boolean>(true);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [scanInterval, setScanInterval] = useState<number>(initialScanInterval);
  const [nextScanTime, setNextScanTime] = useState<Date | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'scanning' | 'error'>('idle');
  const [currentPaginationToken, setCurrentPaginationToken] = useState<string | null>(null);
  const [continuingScan, setContinuingScan] = useState<boolean>(false);
  const supabase = createClientComponentClient();

  // Function to check for recent start_bot logs and calculate next scan time
  const checkForPendingScans = async () => {
    if (status !== 'idle') return;
    
    try {
      setStatus('checking');
      
      // Fetch scan config including last_scan_time
      const { data: configData, error: configError } = await supabase
        .from('scan_configs')
        .select('scan_interval, is_active, last_scan_time')
        .eq('id', configId)
        .single();
      
      if (configError) {
        throw new Error(`Failed to fetch scan config: ${configError.message}`);
      }
      
      console.log(`Auto scan polling check - Scan interval: ${configData.scan_interval}, Last scan time: ${configData.last_scan_time}, Is active: ${configData.is_active}`);
      
      if (configData.scan_interval !== scanInterval) {
        setScanInterval(configData.scan_interval);
      }
      
      if (!configData.is_active) {
        setIsPolling(false);
        setStatus('idle');
        return;
      }
      
      // Reset pagination token if we're not in the middle of a continued scan
      if (!continuingScan) {
        setCurrentPaginationToken(null);
      }
      
      // Simply trigger a scan immediately
      // The scan API will check if there's time left in the interval
      console.log('Running scan immediately if there is time left in the interval');
      triggerScan();
      
      setStatus('idle');
    } catch (error) {
      console.error('Error checking for pending scans:', error);
      setStatus('error');
      if (onError && error instanceof Error) {
        onError(error);
      }
    }
  };

  // Function to trigger a new scan
  const triggerScan = async () => {
    try {
      console.log('========== TRIGGERING NEW SCAN ==========');
      setStatus('scanning');
      
      const currentTime = new Date();
      console.log(`Triggering scan at: ${currentTime.toISOString()}`);
      
      // Prepare request body with pagination token if available
      const requestBody: any = {
        configId,
        startTime: currentTime.toISOString()
      };
      
      // Include pagination token if we're continuing a scan
      if (currentPaginationToken) {
        requestBody.after = currentPaginationToken;
        console.log(`Continuing scan with pagination token: ${currentPaginationToken}`);
      } else {
        console.log('Starting new scan from the beginning (no pagination token)');
      }
      
      const response = await fetch('/api/reddit/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to trigger scan');
      }
      
      // Parse response to check for pagination info
      const scanResult = await response.json();
      console.log('Scan result:', scanResult);
      
      // Check if there are more posts to fetch
      if (scanResult.hasMorePosts && scanResult.after) {
        console.log(`More posts available. Pagination token: ${scanResult.after}`);
        
        // Save the pagination token for the next scan
        setCurrentPaginationToken(scanResult.after);
        
        // Trigger another scan immediately to continue fetching posts
        console.log('Triggering follow-up scan to fetch more posts...');
        setContinuingScan(true);
        
        // Short delay to prevent rate limiting
        setTimeout(() => {
          triggerScan();
        }, 2000);
      } else {
        // No more posts to fetch, reset pagination state
        console.log('No more posts to fetch or end of pagination.');
        setCurrentPaginationToken(null);
        setContinuingScan(false);
        
        // Set local state for last scan time to current time
        setLastScanTime(currentTime);
        
        // Calculate and set next scan time only if we're done with pagination
        const nextScan = new Date(currentTime.getTime() + (scanInterval * 60 * 1000));
        setNextScanTime(nextScan);
        
        console.log(`Complete scan finished. Next scan scheduled for: ${nextScan.toISOString()} (in ${scanInterval} minutes)`);
        
        // Refresh the scan config after triggering to get the updated last_scan_time from the database
        try {
          const { data: updatedConfig } = await supabase
            .from('scan_configs')
            .select('last_scan_time')
            .eq('id', configId)
            .single();
            
          if (updatedConfig && updatedConfig.last_scan_time) {
            console.log(`Database last_scan_time updated to: ${updatedConfig.last_scan_time}`);
          }
        } catch (refreshError) {
          console.warn('Failed to refresh scan config after triggering scan:', refreshError);
        }
      }
      
      if (onScanTriggered) {
        onScanTriggered();
      }
    } catch (error) {
      console.error('Error triggering scan:', error);
      setStatus('error');
      // Reset pagination state on error to prevent getting stuck
      setCurrentPaginationToken(null);
      setContinuingScan(false);
      if (onError && error instanceof Error) {
        onError(error);
      }
    } finally {
      setStatus('idle');
    }
  };

  // Set up polling interval to check for pending scans
  useEffect(() => {
    if (!isPolling) return;
    
    // Don't set up a new interval if we're continuing a scan with pagination
    if (!continuingScan) {
      // Initial check when component mounts
      checkForPendingScans();
      
      // Poll every minute to check if it's time for a new scan
      const intervalId = setInterval(() => {
        if (!continuingScan) {
          checkForPendingScans();
        }
      }, 60 * 1000); // Check every minute
      
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [isPolling, configId, userId, scanInterval, continuingScan]);

  return null; // This is a utility component with no UI
}