'use client';

import { useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function useAuthRedirectUrl() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useMemo(() => {
    const query = searchParams?.toString();
    if (!pathname) return '/dashboard';
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
}
