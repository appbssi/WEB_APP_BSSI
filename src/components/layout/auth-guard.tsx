'use client';

import { useUser } from '@/firebase';
import { useRouter, usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useRole, canAccessRoute, getDefaultRouteForUser } from '@/hooks/use-role';

const publicPaths = ['/', '/login'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { role, isRoleLoading } = useRole();
  const router = useRouter();
  const pathname = usePathname();
  const [userIdc, setUserIdc] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('app-user-idc') || '').toUpperCase().trim();
    }
    return '';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserIdc((localStorage.getItem('app-user-idc') || '').toUpperCase().trim());
    }
  }, []);

  const isPublicPath = publicPaths.includes(pathname);
  const isRouteAllowed = isPublicPath || canAccessRoute(role, userIdc, pathname);

  useEffect(() => {
    if (isUserLoading || isRoleLoading) return;

    if (user) {
      if (isPublicPath || !isRouteAllowed) {
        router.push(getDefaultRouteForUser(role, userIdc));
      }
    } else if (!isPublicPath) {
      router.push('/');
    }
  }, [user, isUserLoading, role, isRoleLoading, router, pathname, userIdc, isPublicPath, isRouteAllowed]);

  const showLoader =
    isUserLoading ||
    isRoleLoading ||
    (user && isPublicPath) ||
    (!user && !isPublicPath) ||
    (user && !isRouteAllowed);

  if (showLoader) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="loader"></div>
      </div>
    );
  }

  return <>{children}</>;
}
