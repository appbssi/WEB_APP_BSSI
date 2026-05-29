
'use client';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserNav } from './user-nav';
import { RecentActivitiesDialog } from '../dashboard/recent-activities-dialog';
import { ChatSheet } from '../chat/chat-sheet';
import { Button } from '../ui/button';
import { useRole } from '@/hooks/use-role';
import { useMemo } from 'react';

export function Header() {
  const { role } = useRole();
  const displayRole = useMemo(() => {
    if (!role) return '';
    if (role === 'admin') return 'Admin';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }, [role]);

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-border bg-background px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
            <div className="md:hidden">
                <SidebarTrigger />
            </div>
        </div>

        <div className="flex flex-1 justify-end">
            {/* Espace réservé pour d'éventuels éléments futurs */}
        </div>

      <div className="flex items-center gap-4">
        {displayRole && (
            <span className="text-sm font-semibold text-foreground">{displayRole}</span>
        )}
        <ChatSheet />
        <RecentActivitiesDialog />
        <UserNav />
      </div>
    </header>
  );
}
