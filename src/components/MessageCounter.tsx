'use client';

import { useState, useEffect } from 'react';
import { createClientSupabaseClient } from '../utils/supabase';
import { useUserPlan } from '../hooks/useUserPlan';

interface MessageCounterProps {
  initialCount: number;
  userId: string;
}

/**
 * MessageCounter - A client component that displays message count with real-time updates
 * 
 * This component subscribes to Supabase real-time changes to update the message count
 * whenever new messages are sent, without requiring a page refresh.
 */
export default function MessageCounter({ initialCount, userId }: MessageCounterProps) {
  const [count, setCount] = useState(initialCount);
  const { messageCount } = useUserPlan();
  
  // If messageCount from useUserPlan is available, use it instead of our local state
  const displayCount = messageCount !== undefined && messageCount !== null 
    ? messageCount 
    : count;

  useEffect(() => {
    // Subscribe to real-time changes on the sent_messages table
    const supabase = createClientSupabaseClient();
    
    const subscription = supabase
      .channel('message-counter')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'sent_messages',
        filter: `user_id=eq.${userId}`
      }, () => {
        // Increment local count when a new message is sent
        setCount(prevCount => prevCount + 1);
      })
      .subscribe();

    // Cleanup subscription when component unmounts
    return () => {
      supabase.removeChannel(subscription);
    };
  }, [userId]);

  return (
    <span className="relative">
      {displayCount}
      <span className="absolute top-0 right-0 -mr-2 -mt-2 flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
      </span>
    </span>
  );
}
