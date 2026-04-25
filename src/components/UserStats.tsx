'use client';

import { useEffect, useState } from 'react';
import { useUserPlan } from '../hooks/useUserPlan';

interface UserStatsProps {
  userId: string;
  refreshTrigger?: number;
}

interface StatsData {
  totalAccounts: number;
  totalTemplates: number;
  totalCommentsPosted: number;
  activeAutoPosters: number;
}

export default function UserStats({
  userId,
  refreshTrigger = 0,
}: UserStatsProps) {
  const [stats, setStats] = useState<StatsData>({
    totalAccounts: 0,
    totalTemplates: 0,
    totalCommentsPosted: 0,
    activeAutoPosters: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const { commentActionCount, remaining, isProUser } = useUserPlan();

  useEffect(() => {
    const fetchStats = async () => {
      if (!userId) return;
      setIsLoading(true);
      try {
        const [
          accountsResponse,
          templatesResponse,
          postedStatsResponse,
          autoPosterResponse,
        ] = await Promise.all([
          fetch('/api/reddit/account'),
          fetch('/api/reddit/templates'),
          fetch('/api/posted-discussions?action=stats'),
          fetch('/api/auto-poster/status'),
        ]);

        const accountsData = await accountsResponse.json();
        const templatesData = await templatesResponse.json();
        const postedStatsData = await postedStatsResponse.json();
        const autoPosterData = await autoPosterResponse.json();

        setStats({
          totalAccounts: accountsResponse.ok
            ? accountsData.accounts?.length || 0
            : 0,
          totalTemplates: templatesResponse.ok
            ? templatesData.templates?.length || 0
            : 0,
          totalCommentsPosted: postedStatsResponse.ok
            ? postedStatsData.totalPosts || 0
            : 0,
          activeAutoPosters: autoPosterResponse.ok
            ? autoPosterData.configs?.length || 0
            : 0,
        });
      } catch (error) {
        console.error('Error fetching user stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchStats();
  }, [userId, refreshTrigger]);

  const displayCount = commentActionCount ?? stats.totalCommentsPosted;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 rounded-xl bg-gray-800/50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Comments Posted',
      value: displayCount,
      desc: !isProUser
        ? `${remaining} remaining this cycle`
        : 'Unlimited plan usage',
      color: 'text-indigo-400',
    },
    {
      title: 'Reddit Accounts',
      value: stats.totalAccounts,
      desc:
        stats.totalAccounts === 0 ? 'Add an account to start' : 'Ready to post',
      color: 'text-orange-400',
    },
    {
      title: 'Reply Playbooks',
      value: stats.totalTemplates,
      desc:
        stats.totalTemplates === 0
          ? 'Create a playbook to start'
          : 'Playbooks ready',
      color: 'text-emerald-400',
    },
    {
      title: 'Active Auto-Posters',
      value: stats.activeAutoPosters,
      desc:
        stats.activeAutoPosters === 0
          ? 'No active configs'
          : 'Currently running',
      color: 'text-rose-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-2xl border border-gray-700 bg-gray-800/70 p-5 shadow-lg"
        >
          <div className={`text-3xl font-bold ${card.color}`}>{card.value}</div>
          <div className="mt-1 text-sm font-medium text-white">
            {card.title}
          </div>
          <div className="mt-2 text-sm text-gray-400">{card.desc}</div>
        </div>
      ))}
    </div>
  );
}
