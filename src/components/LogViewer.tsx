'use client';

import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { createClientSupabaseClient } from '../utils/supabase';
import { useUserPlan } from '../hooks/useUserPlan';

// Define log action types for better type safety
type LogAction =
  | 'start_scan'
  | 'scan_complete'
  | 'start_bot'
  | 'stop_bot'
  | 'reddit_auth_attempt'
  | 'reddit_auth_success'
  | 'reddit_auth_error'
  | 'reddit_auth_retry'
  | 'reddit_api_request'
  | 'reddit_api_success'
  | 'reddit_api_error'
  | 'reddit_api_retry'
  | 'check_subreddit_access'
  | 'subreddit_access_error'
  | 'fetch_posts'
  | 'process_post'
  | 'keyword_check'
  | 'keyword_match'
  | 'send_message'
  | 'rate_limit'
  | 'gemini_api_error'
  | 'ai_analysis'
  | 'ai_analysis_success'
  | 'ai_analysis_error'
  | 'fallback_keyword_matching';

// Define log status types
type LogStatus = 'info' | 'success' | 'warning' | 'error';

interface LogViewerProps {
  userId: string;
  refreshTrigger?: number; // Add refreshTrigger prop to force refresh
  onStopBot?: (subreddit: string, configId?: string) => void; // Add callback for stopping a specific bot
  configIdFilter?: string; // Add filter for specific bot logs
  showBackButton?: boolean; // Show back button for detailed view
  onBack?: () => void; // Callback for back button
  initialFilters?: LogFilters; // Initial filter settings
}

// Interface for log filtering options
interface LogFilters {
  action?: string | string[];
  status?: string | string[];
  subreddit?: string;
  timeRange?: 'last-hour' | 'last-day' | 'last-week' | 'all';
  search?: string;
}

interface BotLog {
  id: string;
  user_id: string;
  action: string;
  status: string;
  subreddit: string;
  recipient?: string;
  created_at: string;
  message_template?: string;
  config_id?: string; // Add config_id to identify the specific bot
  error_message?: string; // Error message or additional details
  analysis_data?: string; // JSON string of analysis data
}

// Interface for grouped logs by action
interface GroupedLogs {
  [key: string]: BotLog[];
}

export default function LogViewer({
  userId,
  refreshTrigger = 0,
  onStopBot,
  configIdFilter,
  showBackButton = false,
  onBack,
  initialFilters = {},
}: LogViewerProps) {
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [groupedLogs, setGroupedLogs] = useState<GroupedLogs>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [filters, setFilters] = useState<LogFilters>(initialFilters);
  const [totalCount, setTotalCount] = useState<number>(0);
  const { isProUser } = useUserPlan();

  // Track if we're viewing detailed logs
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');
  const [viewingDetailedLogs, setViewingDetailedLogs] = useState(false);
  const [detailedConfigId, setDetailedConfigId] = useState<string | null>(null);

  // Current page for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = isProUser ? 50 : 25;

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setIsLoading(true);

        // Build the URL with all filter parameters
        const offset = (currentPage - 1) * logsPerPage;
        let url = `/api/reddit/bot-logs?limit=${logsPerPage}&offset=${offset}`;

        // If viewing detailed logs for a specific bot, use the configId
        if (detailedConfigId) {
          url += `&config_id=${detailedConfigId}`;
        }
        // Add config_id filter if provided (this takes precedence over other filters)
        else if (configIdFilter) {
          url += `&config_id=${configIdFilter}`;
        } else {
          // In main view, only show 'start_bot' actions unless specific filters are applied
          if (!filters.action && !viewingDetailedLogs) {
            url += `&action=start_bot`;
          } else if (filters.action) {
            const actionParam = Array.isArray(filters.action)
              ? filters.action.join(',')
              : filters.action;
            url += `&action=${encodeURIComponent(actionParam)}`;
          }

          if (filters.status) {
            const statusParam = Array.isArray(filters.status)
              ? filters.status.join(',')
              : filters.status;
            url += `&status=${encodeURIComponent(statusParam)}`;
          }

          if (filters.subreddit) {
            url += `&subreddit=${encodeURIComponent(filters.subreddit)}`;
          }

          // Add time range filters
          if (filters.timeRange && filters.timeRange !== 'all') {
            const now = new Date();
            let fromDate = new Date();

            switch (filters.timeRange) {
              case 'last-hour':
                fromDate.setHours(now.getHours() - 1);
                break;
              case 'last-day':
                fromDate.setDate(now.getDate() - 1);
                break;
              case 'last-week':
                fromDate.setDate(now.getDate() - 7);
                break;
            }

            url += `&from_date=${encodeURIComponent(fromDate.toISOString())}`;
          }
        }

        console.log('Fetching logs with URL:', url);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error('Failed to fetch logs');
        }

        const data = await response.json();
        setLogs(data.logs || []);
        setGroupedLogs(data.groupedLogs || {});
        setTotalCount(data.count || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch logs');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      // Prevent multiple intervals
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(fetchLogs, 10_000); // 10 s throttle
    };

    if (viewingDetailedLogs && currentPage === 1 && !document.hidden) {
      startPolling();
    }

    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } else {
        // Page became visible – resume polling if conditions still apply
        if (!intervalId && viewingDetailedLogs && currentPage === 1) {
          startPolling();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    userId,
    isProUser,
    refreshTrigger,
    configIdFilter,
    filters,
    currentPage,
    logsPerPage,
    detailedConfigId,
    viewingDetailedLogs,
  ]); // Add all dependencies

  // Helper function to get color for different action types
  const getActionColor = (action: string) => {
    switch (action) {
      case 'send_message':
        return 'text-blue-400';
      case 'start_scan':
        return 'text-green-400';
      case 'scan_complete':
        return 'text-green-500';
      case 'reddit_auth_success':
        return 'text-indigo-400';
      case 'reddit_auth_error':
      case 'reddit_api_error':
      case 'gemini_api_error':
        return 'text-red-400';
      case 'keyword_match':
        return 'text-yellow-400';
      case 'rate_limit':
        return 'text-orange-400';
      case 'ai_analysis_success':
      case 'ai_analysis':
        return 'text-teal-400';
      case 'ai_analysis_error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  // Helper function to get icon for different status types
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span className="flex items-center text-green-500">
            <svg
              className="w-4 h-4 mr-1"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Success
          </span>
        );
      case 'warning':
        return (
          <span className="flex items-center text-yellow-500">
            <svg
              className="w-4 h-4 mr-1"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            Warning
          </span>
        );
      case 'info':
        return (
          <span className="flex items-center text-blue-500">
            <svg
              className="w-4 h-4 mr-1"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            Info
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center text-red-500">
            <svg
              className="w-4 h-4 mr-1"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            Error
          </span>
        );
      default:
        return (
          <span className="flex items-center text-gray-500">
            <svg
              className="w-4 h-4 mr-1"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            Unknown
          </span>
        );
    }
  };

  // Format action name for display
  const formatActionName = (action: string) => {
    return action
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Toggle expanded view for a log entry
  const toggleExpandLog = (logId: string) => {
    setExpandedLogId(expandedLogId === logId ? null : logId);
  };

  // Handle filter changes
  const handleFilterChange = (filterKey: keyof LogFilters, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [filterKey]: value,
    }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  // Toggle view mode between list and grouped
  const toggleViewMode = () => {
    setViewMode(viewMode === 'list' ? 'grouped' : 'list');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Render filter controls
  const renderFilterControls = () => {
    return (
      <div className="bg-gray-800 p-4 border-b border-gray-700 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          {/* View mode toggle */}
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleViewMode}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            >
              List View
            </button>
            <button
              onClick={toggleViewMode}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${viewMode === 'grouped' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            >
              Grouped View
            </button>
          </div>

          {/* Status filter */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400">Status:</span>
            <select
              value={
                Array.isArray(filters.status)
                  ? filters.status[0]
                  : filters.status || ''
              }
              onChange={(e) =>
                handleFilterChange('status', e.target.value || undefined)
              }
              className="bg-gray-700 text-gray-200 text-xs rounded-md px-2 py-1.5 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>

          {/* Time range filter */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400">Time:</span>
            <select
              value={filters.timeRange || 'all'}
              onChange={(e) =>
                handleFilterChange(
                  'timeRange',
                  e.target.value === 'all' ? undefined : e.target.value
                )
              }
              className="bg-gray-700 text-gray-200 text-xs rounded-md px-2 py-1.5 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All Time</option>
              <option value="last-hour">Last Hour</option>
              <option value="last-day">Last 24 Hours</option>
              <option value="last-week">Last 7 Days</option>
            </select>
          </div>

          {/* Action type filter - only show if not in configIdFilter mode */}
          {!configIdFilter && (
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-400">Action:</span>
              <select
                value={
                  Array.isArray(filters.action)
                    ? filters.action[0]
                    : filters.action || ''
                }
                onChange={(e) =>
                  handleFilterChange('action', e.target.value || undefined)
                }
                className="bg-gray-700 text-gray-200 text-xs rounded-md px-2 py-1.5 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">All Actions</option>
                <option value="start_scan">Start Scan</option>
                <option value="scan_complete">Scan Complete</option>
                <option value="reddit_auth_success">Auth Success</option>
                <option value="reddit_auth_error">Auth Error</option>
                <option value="send_message">Send Message</option>
                <option value="keyword_match">Keyword Match</option>
                <option value="rate_limit">Rate Limit</option>
              </select>
            </div>
          )}

          {/* Clear filters button */}
          {(filters.status || filters.action || filters.timeRange) && (
            <button
              onClick={() => setFilters({})}
              className="px-3 py-1.5 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Results count */}
        <div className="text-xs text-gray-400">
          Showing {logs.length} of {totalCount} logs
          {configIdFilter && (
            <span> for bot ID: {configIdFilter.substring(0, 8)}...</span>
          )}
        </div>
      </div>
    );
  };

  // Render a single log entry with expandable details
  const renderLogEntry = (log: BotLog) => {
    const isExpanded = expandedLogId === log.id;

    return (
      <tr
        key={log.id}
        className={`hover:bg-gray-700/20 transition-colors duration-150 ${isExpanded ? 'bg-gray-700/30' : ''}`}
      >
        <td className="whitespace-nowrap py-3 px-4 text-sm text-gray-300">
          {formatDate(log.created_at)}
        </td>
        <td className="whitespace-nowrap py-3 px-4 text-sm">
          <span className={`font-medium ${getActionColor(log.action)}`}>
            {formatActionName(log.action)}
          </span>
        </td>
        <td className="whitespace-nowrap py-3 px-4 text-sm text-gray-300">
          {log.subreddit ? `r/${log.subreddit}` : '—'}
        </td>
        <td className="whitespace-nowrap py-3 px-4 text-sm text-gray-300">
          {log.recipient ? log.recipient : '—'}
        </td>
        <td className="whitespace-nowrap py-3 px-4 text-sm">
          {getStatusIcon(log.status)}
        </td>
        <td className="whitespace-nowrap py-3 px-4 text-sm">
          {/* show badge only for message_* logs */}
          {log.action.startsWith('message_') && (
            <span className="text-xs text-yellow-300">Delay&nbsp;~3m</span>
          )}
          <button
            onClick={() => toggleExpandLog(log.id)}
            className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors duration-200 flex items-center"
          >
            {isExpanded ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3 mr-1"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                Hide
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3 mr-1"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                Details
              </>
            )}
          </button>
        </td>
        {onStopBot && (
          <td className="whitespace-nowrap py-3 px-4 text-sm">
            <div className="flex space-x-2">
              {(log.action === 'start_scan' || log.action === 'start_bot') &&
                log.status === 'success' && (
                  <button
                    onClick={() =>
                      onStopBot(log.subreddit || '', log.config_id)
                    }
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
                    Stop
                  </button>
                )}
              {/* Only show View Logs button for start_bot logs or when not in detailed view */}
              {log.config_id &&
                (log.action === 'start_bot' || !viewingDetailedLogs) && (
                  <button
                    onClick={() => {
                      setDetailedConfigId(log.config_id || null);
                      setViewingDetailedLogs(true);
                      // Reset filters when viewing detailed logs
                      setFilters({});
                    }}
                    className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200 flex items-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3 w-3 mr-1"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path
                        fillRule="evenodd"
                        d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    View Logs
                  </button>
                )}
            </div>
          </td>
        )}
      </tr>
    );
  };

  // Render expanded details for a log entry
  const renderExpandedDetails = (log: BotLog) => {
    if (expandedLogId !== log.id) return null;

    return (
      <tr className="bg-gray-800/50">
        <td colSpan={onStopBot ? 7 : 6} className="p-4">
          <div className="text-sm text-gray-300 space-y-3">
            {/* Log ID */}
            <div>
              <span className="text-gray-400 font-medium">Log ID:</span>{' '}
              {log.id}
            </div>

            {/* Error message if present */}
            {log.error_message && (
              <div>
                <span className="text-gray-400 font-medium">Details:</span>
                <pre className="mt-1 p-2 bg-gray-900/50 rounded text-xs overflow-x-auto">
                  {log.error_message}
                </pre>
              </div>
            )}

            {/* Message template if present */}
            {log.message_template && (
              <div>
                <span className="text-gray-400 font-medium">
                  Message Template:
                </span>
                <pre className="mt-1 p-2 bg-gray-900/50 rounded text-xs overflow-x-auto">
                  {log.message_template}
                </pre>
              </div>
            )}

            {/* Analysis data if present */}
            {log.analysis_data && (
              <div>
                <span className="text-gray-400 font-medium">
                  Analysis Data:
                </span>
                <pre className="mt-1 p-2 bg-gray-900/50 rounded text-xs overflow-x-auto">
                  {JSON.stringify(JSON.parse(log.analysis_data), null, 2)}
                </pre>
              </div>
            )}

            {/* Config ID if present */}
            {log.config_id && (
              <div>
                <span className="text-gray-400 font-medium">Config ID:</span>{' '}
                {log.config_id}
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] w-full">
        <div className="loader">
          <div className="circle"></div>
          <div className="circle"></div>
          <div className="circle"></div>
          <div className="circle"></div>
        </div>
        <style jsx>{`
          .loader {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            height: 40px;
          }
          .circle {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: #6366f1;
            animation: bounce 1.2s infinite ease-in-out;
          }
          .circle:nth-child(1) {
            animation-delay: 0s;
          }
          .circle:nth-child(2) {
            animation-delay: 0.2s;
          }
          .circle:nth-child(3) {
            animation-delay: 0.4s;
          }
          .circle:nth-child(4) {
            animation-delay: 0.6s;
          }
          @keyframes bounce {
            0%,
            80%,
            100% {
              transform: scale(0);
              opacity: 0.5;
            }
            40% {
              transform: scale(1);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    );
  }

  // Render pagination controls
  const renderPagination = () => {
    const totalPages = Math.ceil(totalCount / logsPerPage);
    if (totalPages <= 1) return null;

    return (
      <div className="bg-gray-800/50 border-t border-gray-700 py-3 px-4 flex items-center justify-between">
        <div className="flex-1 flex justify-between sm:hidden">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className={`px-4 py-2 text-sm rounded-md ${currentPage === 1 ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
          >
            Previous
          </button>
          <button
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className={`ml-3 px-4 py-2 text-sm rounded-md ${currentPage === totalPages ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
          >
            Next
          </button>
        </div>
        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-400">
              Showing{' '}
              <span className="font-medium text-gray-300">
                {(currentPage - 1) * logsPerPage + 1}
              </span>{' '}
              to{' '}
              <span className="font-medium text-gray-300">
                {Math.min(currentPage * logsPerPage, totalCount)}
              </span>{' '}
              of <span className="font-medium text-gray-300">{totalCount}</span>{' '}
              results
            </p>
          </div>
          <div>
            <nav
              className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
              aria-label="Pagination"
            >
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-700 text-sm font-medium ${currentPage === 1 ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
              >
                <span className="sr-only">First</span>
                <svg
                  className="h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                  <path
                    fillRule="evenodd"
                    d="M8.707 5.293a1 1 0 010 1.414L5.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`relative inline-flex items-center px-2 py-2 border border-gray-700 text-sm font-medium ${currentPage === 1 ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
              >
                <span className="sr-only">Previous</span>
                <svg
                  className="h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Show pages around current page
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`relative inline-flex items-center px-4 py-2 border border-gray-700 text-sm font-medium ${currentPage === pageNum ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className={`relative inline-flex items-center px-2 py-2 border border-gray-700 text-sm font-medium ${currentPage === totalPages ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
              >
                <span className="sr-only">Next</span>
                <svg
                  className="h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-700 text-sm font-medium ${currentPage === totalPages ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
              >
                <span className="sr-only">Last</span>
                <svg
                  className="h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <svg
                  className="h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </nav>
          </div>
        </div>
      </div>
    );
  };

  // Render the grouped view of logs
  const renderGroupedView = () => {
    if (Object.keys(groupedLogs).length === 0) {
      return (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-300">
            No logs found
          </h3>
          <p className="mt-1 text-gray-400">
            Try adjusting your filters or run your bots to generate logs.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6 p-4">
        {Object.entries(groupedLogs).map(([action, actionLogs]) => (
          <div
            key={action}
            className="bg-gray-800/30 border border-gray-700/50 rounded-lg overflow-hidden"
          >
            <div className="bg-gray-800 px-4 py-3 flex justify-between items-center">
              <h3 className={`font-medium ${getActionColor(action)}`}>
                {formatActionName(action)}
                <span className="ml-2 text-xs text-gray-400">
                  ({actionLogs.length})
                </span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-800/80">
                  <tr>
                    <th
                      scope="col"
                      className="py-3 px-4 text-left text-xs font-semibold text-gray-300"
                    >
                      Time
                    </th>
                    <th
                      scope="col"
                      className="py-3 px-4 text-left text-xs font-semibold text-gray-300"
                    >
                      Subreddit
                    </th>
                    <th
                      scope="col"
                      className="py-3 px-4 text-left text-xs font-semibold text-gray-300"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="py-3 px-4 text-left text-xs font-semibold text-gray-300"
                    >
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {actionLogs.map((log) => (
                    <Fragment key={log.id}>
                      <tr
                        className={`hover:bg-gray-700/20 transition-colors duration-150 ${expandedLogId === log.id ? 'bg-gray-700/30' : ''}`}
                      >
                        <td className="whitespace-nowrap py-2 px-4 text-xs text-gray-300">
                          {formatDate(log.created_at)}
                        </td>
                        <td className="whitespace-nowrap py-2 px-4 text-xs text-gray-300">
                          {log.subreddit ? `r/${log.subreddit}` : '—'}
                        </td>
                        <td className="whitespace-nowrap py-2 px-4 text-xs">
                          {getStatusIcon(log.status)}
                        </td>
                        <td className="whitespace-nowrap py-2 px-4 text-xs flex items-center space-x-2">
                          {log.action.startsWith('message_') && (
                            <span className="text-xs text-yellow-300">Delay&nbsp;~2m</span>
                          )} 
                          <button
                            onClick={() => toggleExpandLog(log.id)}
                            className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors duration-200 flex items-center"
                          >
                            {expandedLogId === log.id
                              ? 'Hide Details'
                              : 'View Details'}
                          </button>
                        </td>
                      </tr>
                      {renderExpandedDetails(log)}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render the list view of logs
  const renderListView = () => {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-800/80">
            <tr>
              <th
                scope="col"
                className="py-3.5 px-4 text-left text-sm font-semibold text-gray-300"
              >
                Time
              </th>
              <th
                scope="col"
                className="py-3.5 px-4 text-left text-sm font-semibold text-gray-300"
              >
                Action
              </th>
              <th
                scope="col"
                className="py-3.5 px-4 text-left text-sm font-semibold text-gray-300"
              >
                Subreddit
              </th>
              <th
                scope="col"
                className="py-3.5 px-4 text-left text-sm font-semibold text-gray-300"
              >
                Recipient
              </th>
              <th
                scope="col"
                className="py-3.5 px-4 text-left text-sm font-semibold text-gray-300"
              >
                Status
              </th>
              <th
                scope="col"
                className="py-3.5 px-4 text-left text-sm font-semibold text-gray-300"
              >
                Details
              </th>
              {onStopBot && (
                <th
                  scope="col"
                  className="py-3.5 px-4 text-left text-sm font-semibold text-gray-300"
                >
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/30 bg-gray-800/30">
            {logs.map((log) => (
              <Fragment key={log.id}>
                {renderLogEntry(log)}
                {renderExpandedDetails(log)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (error) {
    return (
      <div className="bg-red-800/20 border border-red-900 rounded-lg p-4 text-red-400">
        <p className="font-medium">Error: {error}</p>
      </div>
    );
  }

  if (logs.length === 0 && !isLoading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-8 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
        <h3 className="mt-2 text-lg font-medium text-gray-300">
          No logs found
        </h3>
        <p className="mt-1 text-gray-400">
          Bot logs will appear here once you start running your bots.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl shadow bg-gray-900/50">
      {/* Back button and header */}
      {(showBackButton && onBack) || viewingDetailedLogs ? (
        <div className="bg-gray-800 p-3 border-b border-gray-700 flex items-center">
          <button
            onClick={() => {
              if (viewingDetailedLogs) {
                setViewingDetailedLogs(false);
                setDetailedConfigId(null);
              } else if (onBack) {
                onBack();
              }
            }}
            className="flex items-center text-gray-300 hover:text-white transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-1"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
            Back to All Logs
          </button>
          {(configIdFilter || detailedConfigId) && (
            <div className="ml-4 px-2 py-1 bg-indigo-900/50 rounded text-sm text-indigo-300">
              Viewing logs for bot:{' '}
              {(detailedConfigId || configIdFilter)?.substring(0, 8)}...
            </div>
          )}
        </div>
      ) : null}

      {/* Header for detailed view */}
      {viewingDetailedLogs && (
        <div className="bg-gray-800/70 py-2 px-4 border-b border-gray-700">
          <h2 className="text-lg font-medium text-white">Bot Activity Logs</h2>
          <p className="text-sm text-gray-400 mt-1">
            Viewing all activities for the selected bot
          </p>
        </div>
      )}

      {/* Filter controls */}
      {renderFilterControls()}

      {/* Log content - either list or grouped view */}
      {viewMode === 'list' ? renderListView() : renderGroupedView()}

      {/* Pagination */}
      {renderPagination()}

      {/* Pro user upsell */}
      {!isProUser && (
        <div className="bg-indigo-900/30 border-t border-indigo-800 py-2 px-4 text-xs text-indigo-300 flex items-center justify-between">
          <span>
            Showing {logsPerPage} logs per page. Upgrade to Pro for more logs
            and advanced filtering.
          </span>
          <a
            href="/pricing"
            className="px-3 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
          >
            Upgrade to Pro
          </a>
        </div>
      )}
    </div>
  );
}
