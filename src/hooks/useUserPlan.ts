import { useState, useEffect, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useUser } from '@clerk/nextjs';
import { createClientSupabaseClient } from '../utils/supabase';

export function useUserPlan() {
  const { user } = useUser();
  const [plan, setPlan] = useState('free');
  const [messageCount, setMessageCount] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
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
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'x-user-id': user?.id || '',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user stats');
        }

        const data = await response.json();
        setPlan(data.subscription_status);
        setMessageCount(data.comment_count ?? data.message_count ?? 0);
        setRemaining(data.remaining);
        setLimit(data.limit);
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

    return () => {
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
    messageCount,
    limit,
    loading,
    remaining,
    isProUser,
  };
}
