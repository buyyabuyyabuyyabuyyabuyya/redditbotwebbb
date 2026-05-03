import { useState, useEffect, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useUser } from '@clerk/nextjs';
import { createClientSupabaseClient } from '../utils/supabase';

export function useUserPlan() {
  const { user } = useUser();
  const [plan, setPlan] = useState('free');
  const [commentActionCount, setCommentActionCount] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [maxWebsiteConfigs, setMaxWebsiteConfigs] = useState(1);
  const [maxAutoPosters, setMaxAutoPosters] = useState(1);
  const [loading, setLoading] = useState(true);

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function fetchUserPlan() {
      try {
        const token = await (user as any)?.getToken?.();
        const response = await fetch('/api/user/stats', {
          cache: 'no-store',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'x-user-id': user?.id || '',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user stats');
        }

        const data = await response.json();
        const accountCommentCount =
          data.comment_count ??
          data.monthly_comment_count ??
          data.message_count ??
          0;
        const planLimit = data.limit ?? data.monthly_comment_limit ?? null;
        setPlan(data.subscription_status);
        setCommentActionCount(accountCommentCount);
        setRemaining(
          planLimit === null
            ? data.remaining
            : Math.max(0, planLimit - accountCommentCount)
        );
        setLimit(planLimit);
        setMaxWebsiteConfigs(data.max_website_configs ?? 1);
        setMaxAutoPosters(data.max_auto_posters ?? 1);
      } catch (error) {
        console.error('Error fetching user plan:', error);
      } finally {
        setLoading(false);
      }
    }

    async function setupRealtimeSubscription() {
      const supabase = createClientSupabaseClient();
      if (channelRef.current) return;

      if (!user?.id) return;

      channelRef.current = supabase
        .channel(`user-stats-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'users',
            filter: `id=eq.${user.id}`,
          },
          () => {
            void fetchUserPlan();
          }
        )
        .subscribe();
    }

    void fetchUserPlan();
    void setupRealtimeSubscription();

    const pollInterval = window.setInterval(() => {
      void fetchUserPlan();
    }, 30_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchUserPlan();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (channelRef.current) {
        const supabase = createClientSupabaseClient();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user]);

  const isProUser = plan !== 'free' && plan !== 'trialing' && plan !== null;

  return {
    plan,
    commentActionCount,
    messageCount: commentActionCount,
    limit,
    maxWebsiteConfigs,
    maxAutoPosters,
    loading,
    remaining,
    isProUser,
  };
}
