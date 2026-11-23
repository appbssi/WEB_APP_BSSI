'use client';

import { useUser, useAuth } from '@/firebase';
import { useRouter, usePathname } from 'next/navigation';
import React, { useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { useRole } from '@/hooks/use-role';

const publicPaths = ['/', '/login'];

// Rubriques accessibles aux administrateurs à accès limité
const allowedPathsForRestricted = ['/dashboard', '/cartographie', '/agents', '/missions', '/logistique', '/gav', '/saisies'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { role, isRoleLoading, restricted } = useRole();
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isRestricted = role === 'admin' && restricted;
  const isAllowedRestricted = isRestricted && allowedPathsForRestricted.some(p => pathname.startsWith(p));
  // Session sans rôle signé (ex. ancienne connexion anonyme) : elle n'est plus valable.
  const hasInvalidSession = !!user && !isRoleLoading && !role;

  useEffect(() => {
    if (isUserLoading || isRoleLoading) return;

    if (hasInvalidSession) {
      signOut(auth).finally(() => router.push('/login'));
      return;
    }

    const isPublicPath = publicPaths.includes(pathname);

    if (user) {
      if (isPublicPath) {
        router.push(role === 'admin' ? '/dashboard' : '/demandes');
      } else if (isRestricted) {
        if (!isAllowedRestricted) router.push('/dashboard');
      } else if (role !== 'admin' && pathname !== '/demandes') {
        router.push('/demandes');
      }
    } else if (!isPublicPath) {
      router.push('/');
    }
  }, [user, isUserLoading, role, isRoleLoading, router, pathname, auth, isRestricted, isAllowedRestricted, hasInvalidSession]);

  // Loader pendant la vérification ou la redirection.
  const isPublicPath = publicPaths.includes(pathname);
  const showLoader = isUserLoading || isRoleLoading ||
    hasInvalidSession ||
    (user && isPublicPath) ||
    (!user && !isPublicPath) ||
    (user && !isRestricted && role !== 'admin' && pathname !== '/demandes') ||
    (user && isRestricted && !isAllowedRestricted);

  if (showLoader) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="loader"></div>
      </div>
    );
  }

  return <>{children}</>;
}
