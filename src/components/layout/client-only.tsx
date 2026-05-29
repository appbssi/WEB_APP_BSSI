
'use client';

import { useIsMounted } from '@/hooks/use-is-mounted';
import Loading from '@/app/(app)/loading';

interface ClientOnlyProps {
  children: React.ReactNode;
}

export function ClientOnly({ children }: ClientOnlyProps) {
  const isMounted = useIsMounted();

  if (!isMounted) {
    return <Loading />;
  }

  return <>{children}</>;
}
