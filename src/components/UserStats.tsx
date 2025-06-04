'use client';

import { useState, useEffect } from 'react';
import { createClientSupabaseClient } from '../utils/supabase';
import { useUserPlan } from '../hooks/useUserPlan';

interface UserStatsProps {
  userId: string;
  // Add a refresh trigger prop to force a refresh when it changes
  refreshTrigger?: number;
}

interface StatsData {
  totalAccounts: number;
  totalTemplates: number;
  totalMessagesSent: number;
  activeConfigs: number;
}

export default function UserStats({ userId, refreshTrigger = 0 }: UserStatsProps) {
  const [stats, setStats] = useState<StatsData>({
    totalAccounts: 0,
    totalTemplates: 0,
    totalMessagesSent: 0,
    activeConfigs: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  // Use real-time message count from useUserPlan hook
  const { plan, messageCount, remaining, isProUser } = useUserPlan();

  useEffect(() => {
    const fetchStats = async () => {
      if (!userId) return;
      
      try {
        setIsLoading(true);
        
        // Get Reddit accounts using API
        const accountsResponse = await fetch('/api/reddit/account');
        const accountsData = await accountsResponse.json();
        const accountCount = accountsData.accounts ? accountsData.accounts.length : 0;
        
        // Get message templates using API
        const templatesResponse = await fetch('/api/reddit/templates');
        const templatesData = await templatesResponse.json();
        const templateCount = templatesData.templates ? templatesData.templates.length : 0;
        
        // Get scan configs using API
        const scanConfigsResponse = await fetch('/api/reddit/scan-config');
        const scanConfigsData = await scanConfigsResponse.json();
        let activeConfigs = 0;
        if (scanConfigsData.configs) {
          activeConfigs = scanConfigsData.configs.filter((config: any) => config.is_active).length;
        }
        
        // For sent messages, we'll use a direct Supabase query for now
        // This could be replaced with an API endpoint in the future
        const supabase = createClientSupabaseClient();
        const { count: messageCount, error } = await supabase
          .from('sent_messages')
          .select('id', { count: 'exact', head: false })
          .eq('user_id', userId);
          
        if (error) {
          console.error('Error fetching message count:', error);
        }
        
        console.log('Stats updated:', {
          accounts: accountCount,
          templates: templateCount,
          messages: messageCount || 0,
          activeConfigs
        });
        
        setStats({
          totalAccounts: accountCount,
          totalTemplates: templateCount,
          totalMessagesSent: messageCount || 0,
          activeConfigs: activeConfigs,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchStats();
  }, [userId, refreshTrigger]); // Add refreshTrigger to dependencies to refresh when it changes

  // Ensure the message count is reflected in the stats for consistency
  useEffect(() => {
    if (messageCount !== undefined && messageCount !== null) {
      setStats(prevStats => ({
        ...prevStats,
        totalMessagesSent: messageCount
      }));
    }
  }, [messageCount]);
  
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-gray-800/50 animate-pulse"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* Card 1 - Total Messages */}
      <div className="stat-card">
        <div className="stat-content">
          <div className="stat-value">{messageCount !== undefined ? messageCount : stats.totalMessagesSent}</div>
          <div className="stat-title">Messages Sent</div>
          {!isProUser && (
            <div className="stat-desc">
              <span className="text-amber-400">{remaining} remaining</span> on free plan
            </div>
          )}
        </div>
        <div className="stat-icon">
          <svg className="h-12 w-12 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
      </div>

      {/* Card 2 - Reddit Accounts */}
      <div className="stat-card">
        <div className="stat-content">
          <div className="stat-value">{stats.totalAccounts}</div>
          <div className="stat-title">Reddit Accounts</div>
          <div className="stat-desc">
            {stats.totalAccounts === 0 ? (
              <span className="text-red-400">Add an account to start</span>
            ) : (
              <span className="text-green-400">Ready to use</span>
            )}
          </div>
        </div>
        <div className="stat-icon">
          <svg className="h-12 w-12 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      </div>

      {/* Card 3 - Message Templates */}
      <div className="stat-card">
        <div className="stat-content">
          <div className="stat-value">{stats.totalTemplates}</div>
          <div className="stat-title">Message Templates</div>
          <div className="stat-desc">
            {stats.totalTemplates === 0 ? (
              <span className="text-amber-400">Create a template to start</span>
            ) : (
              <span className="text-green-400">Templates ready</span>
            )}
          </div>
        </div>
        <div className="stat-icon">
          <svg className="h-12 w-12 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
      </div>

      {/* Card 4 - Active Bots */}
      <div className="stat-card">
        <div className="stat-content">
          <div className="stat-value">{stats.activeConfigs}</div>
          <div className="stat-title">Active Bots</div>
          <div className="stat-desc">
            {stats.activeConfigs === 0 ? (
              <span className="text-gray-400">No active bots</span>
            ) : (
              <span className="text-blue-400">Currently running</span>
            )}
          </div>
        </div>
        <div className="stat-icon">
          <svg className="h-12 w-12 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      </div>

      <style jsx>{`
        .stat-card {
          @apply relative flex items-center p-6 bg-gray-800 rounded-xl shadow-md overflow-hidden transition-all duration-300;
          @apply border border-gray-700/50 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/10;
        }
        
        .stat-content {
          @apply flex-1;
        }
        
        .stat-value {
          @apply text-3xl font-bold text-white mb-1;
        }
        
        .stat-title {
          @apply text-sm font-medium text-gray-300;
        }
        
        .stat-desc {
          @apply text-xs text-gray-400 mt-1;
        }
        
        .stat-icon {
          @apply absolute right-4 opacity-50;
        }
      `}</style>
    </div>
  );
}
