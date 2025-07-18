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
        // Use the API endpoint instead of direct Supabase queries
        const token = await user?.getToken?.();
        const response = await fetch('/api/user/stats', {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'x-user-id': user.id,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user stats');
        }

        const data = await response.json();

        setPlan(data.subscription_status);
        setMessageCount(data.message_count);
        setRemaining(data.remaining);
        setLimit(data.limit);
      } catch (error) {
        console.error('Error fetching user plan:', error);
      } finally {
        setLoading(false);
      }
    }

    async function setupRealtimeSubscription() {
      if (!user) return;

      try {
        const supabase = createClientSupabaseClient();
        if (channelRef.current) return; // prevent duplicate subscribe
        // Setup realtime subscription to sent_messages table
        channelRef.current = supabase
          .channel('message-count-changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'sent_messages',
              filter: `user_id=eq.${user.id}`,
            },
            () => {
              // When any change happens to sent_messages, refresh the count
              fetchUserPlan();
            }
          )
          .subscribe();
      } catch (error) {
        console.error('Error setting up realtime subscription:', error);
      }
    }

    fetchUserPlan();
    setupRealtimeSubscription();

    // Cleanup subscription when component unmounts
    return () => {
      if (channelRef.current) {
        const supabase = createClientSupabaseClient();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user]);

  // Consider any plan that is not explicitly 'free' or 'trialing' as a paid plan
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
