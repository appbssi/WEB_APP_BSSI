'use client';

import { useUser, useAuth } from '@/firebase';
import { Loader2 } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import React, { useEffect } from 'react';
import { signOut } from 'firebase/auth';

const publicPaths = ['/', '/login'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isUserLoading) return;

    const isPublicPath = publicPaths.includes(pathname);

    if (user && isPublicPath) {
       router.push('/dashboard');
    }

    if (!user && !isPublicPath) {
      router.push('/');
    }
  }, [user, isUserLoading, router, pathname, auth]);

  // Show loader during auth check or when redirecting.
  const isPublicPath = publicPaths.includes(pathname);
  const showLoader = isUserLoading || (user && isPublicPath) || (!user && !isPublicPath);

  if (showLoader) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="loader"></div>
      </div>
    );
  }

  return <>{children}</>;
}
