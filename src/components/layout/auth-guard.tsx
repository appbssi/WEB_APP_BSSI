'use client';

import { useUser, useAuth } from '@/firebase';
import { Loader2 } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { useRole } from '@/hooks/use-role';

const publicPaths = ['/', '/login'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { role, isRoleLoading } = useRole();
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [userIdc, setUserIdc] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserIdc((localStorage.getItem('app-user-idc') || '').toUpperCase().trim());
    }
  }, []);

  const isSpecialIdc = userIdc === 'VUCE1Z' || userIdc === 'CQZSBH';
  const allowedPathsForSpecial = ['/dashboard', '/cartographie', '/agents', '/missions', '/logistique', '/gav'];
  const isAllowedSpecial = isSpecialIdc && allowedPathsForSpecial.some(p => pathname.startsWith(p));

  useEffect(() => {
    if (isUserLoading || isRoleLoading) return;

    const isPublicPath = publicPaths.includes(pathname);

    if (user) {
      if (isPublicPath) {
        if (role === 'admin' || isSpecialIdc) {
          router.push('/dashboard');
        } else {
          router.push('/demandes');
        }
      } else {
        if (isSpecialIdc) {
          if (!isAllowedSpecial) {
            router.push('/dashboard');
          }
        } else if (role !== 'admin' && pathname !== '/demandes') {
          router.push('/demandes');
        }
      }
    } else {
      if (!isPublicPath) {
        router.push('/');
      }
    }
  }, [user, isUserLoading, role, isRoleLoading, router, pathname, auth, isSpecialIdc, isAllowedSpecial]);

  // Show loader during auth check or when redirecting.
  const isPublicPath = publicPaths.includes(pathname);
  const showLoader = isUserLoading || isRoleLoading || 
    (user && isPublicPath) || 
    (!user && !isPublicPath) || 
    (user && !isSpecialIdc && role !== 'admin' && pathname !== '/demandes') || 
    (user && isSpecialIdc && !isAllowedSpecial);

  if (showLoader) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="loader"></div>
      </div>
    );
  }

  return <>{children}</>;
}
