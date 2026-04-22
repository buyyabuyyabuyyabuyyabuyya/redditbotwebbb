'use client';

import { useEffect, useState } from 'react';
import { useUserPlan } from '../hooks/useUserPlan';

interface CommentCounterProps {
  initialCount: number;
}

export default function CommentCounter({ initialCount }: CommentCounterProps) {
  const [count, setCount] = useState(initialCount);
  const { messageCount } = useUserPlan();

  useEffect(() => {
    if (messageCount !== undefined && messageCount !== null) {
      setCount(messageCount);
    }
  }, [messageCount]);

  return (
    <span className="relative">
      {count}
      <span className="absolute right-0 top-0 -mr-2 -mt-2 flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
      </span>
    </span>
  );
}
