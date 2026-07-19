'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function NavigationWatcher() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Refresh Next.js dynamic routing and data cache on each navigation
    router.refresh();
  }, [pathname, router]);

  return null;
}
