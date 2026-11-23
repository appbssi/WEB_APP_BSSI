'use client';

import { useUser, useAuth } from '@/firebase';
import { useRouter, usePathname } from 'next/navigation';
import React, { useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { useRole, canAccessRoute, getDefaultRouteForUser } from '@/hooks/use-role';

const publicPaths = ['/', '/login'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { role, isRoleLoading, restricted } = useRole();
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublicPath = publicPaths.includes(pathname);
  const isRouteAllowed = isPublicPath || canAccessRoute(role, restricted, pathname);
  // Session sans rôle signé (ex. ancienne connexion anonyme) : elle n'est plus valable.
  const hasInvalidSession = !!user && !isRoleLoading && !role;

  useEffect(() => {
    if (isUserLoading || isRoleLoading) return;

    if (hasInvalidSession) {
      signOut(auth).finally(() => router.push('/login'));
      return;
    }

    if (user) {
      if (isPublicPath || !isRouteAllowed) {
        router.push(getDefaultRouteForUser(role));
      }
    } else if (!isPublicPath) {
      router.push('/');
    }
  }, [user, isUserLoading, role, isRoleLoading, router, pathname, auth, isPublicPath, isRouteAllowed, hasInvalidSession]);

  const showLoader =
    isUserLoading ||
    isRoleLoading ||
    hasInvalidSession ||
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
