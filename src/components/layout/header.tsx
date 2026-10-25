
'use client';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserNav } from './user-nav';
import { RecentActivitiesDialog } from '../dashboard/recent-activities-dialog';
import { ChatSheet } from '../chat/chat-sheet';
import { DetachementSelector } from './detachement-selector';
import { ThemeToggle } from './theme-toggle';
import { Button } from '../ui/button';
import { useRole } from '@/hooks/use-role';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, doc, setDoc } from 'firebase/firestore';
import type { Demande, Agent, Mission } from '@/lib/types';

function NotificationBell() {
  const { role } = useRole();
  const firestore = useFirestore();
  const router = useRouter();
  const [userIdc, setUserIdc] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserIdc((localStorage.getItem('app-user-idc') || '').toUpperCase());
    }
  }, []);

  const demandsQuery = useMemoFirebase(() => {
    if (!firestore || !role) return null;
    if (role === 'admin') {
      return query(collection(firestore, 'demandes'), where('status', '==', 'en_attente'));
    } else if (userIdc) {
      return query(collection(firestore, 'demandes'), where('agentId', '==', userIdc), where('vu_par_agent', '==', false));
    }
    return null;
  }, [firestore, role, userIdc]);

  const missionsQuery = useMemoFirebase(() => {
    if (!firestore || role !== 'admin') return null;
    return collection(firestore, 'missions');
  }, [firestore, role]);

  const { data: notifications } = useCollection<Demande>(demandsQuery);
  const { data: missions } = useCollection<Mission>(missionsQuery);

  const expiringMissionsCount = useMemo(() => {
    if (role !== 'admin' || !missions) return 0;
    const now = Date.now();
    return missions.filter((m) => {
      if (
        m.status === 'Terminée' ||
        m.status === 'Annulée' ||
        m.status === 'Rejetée' ||
        m.validationStatus === 'Rejetée'
      ) {
        return false;
      }
      const rawEnd = m.endDate;
      if (!rawEnd) return false;
      let date: Date | null = null;
      if (typeof (rawEnd as any).toDate === 'function') date = (rawEnd as any).toDate();
      else if (rawEnd instanceof Date) date = new Date(rawEnd.getTime());
      else if (typeof rawEnd === 'string' || typeof rawEnd === 'number') date = new Date(rawEnd);
      else if (typeof rawEnd === 'object' && (rawEnd as any).seconds !== undefined) date = new Date((rawEnd as any).seconds * 1000);
      if (!date || isNaN(date.getTime())) return false;

      if (m.endTime && typeof m.endTime === 'string') {
        const [h, min] = m.endTime.split(':').map(Number);
        if (!isNaN(h) && !isNaN(min)) date.setHours(h, min, 0, 0);
        else date.setHours(23, 59, 59, 999);
      } else {
        date.setHours(23, 59, 59, 999);
      }

      const diffHours = (date.getTime() - now) / 3600000;
      return diffHours <= 48 && diffHours >= -72;
    }).length;
  }, [missions, role]);

  const badgeCount = (notifications?.length || 0) + expiringMissionsCount;

  const handleClick = async () => {
    if (role === 'admin') {
      if (expiringMissionsCount > 0) {
        router.push('/dashboard#expiring-missions');
      } else {
        router.push('/dashboard');
      }
    } else {
      router.push('/demandes');
      // Mark as read in Firestore
      if (notifications && notifications.length > 0 && firestore) {
        notifications.forEach(async (dem) => {
          try {
            await setDoc(doc(firestore, 'demandes', dem.id), { vu_par_agent: true }, { merge: true });
          } catch (err) {
            console.error('Error marking as read:', err);
          }
        });
      }
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative rounded-full hover:bg-muted"
      onClick={handleClick}
      title={
        role === 'admin'
          ? `Alertes admin : ${notifications?.length || 0} demande(s), ${expiringMissionsCount} mission(s) à terme (< 48h)`
          : "Mes Notifications"
      }
    >
      <Bell className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
      {badgeCount > 0 && (
        <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white ring-2 ring-background animate-bounce">
          {badgeCount}
        </span>
      )}
    </Button>
  );
}

export function Header() {
  const { role } = useRole();
  const firestore = useFirestore();
  const [userIdc, setUserIdc] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserIdc((localStorage.getItem('app-user-idc') || '').toUpperCase());
    }
  }, []);

  const agentsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'agents') : null), [firestore]);
  const { data: agents } = useCollection<Agent>(agentsQuery);

  const currentAgent = useMemo(() => {
    if (!agents || !userIdc) return null;
    const cleanIdc = userIdc.trim().toUpperCase();
    return agents.find(a => {
      if (!a || !a.id) return false;
      const aId = String(a.id).trim().toUpperCase();
      const aReg = a.registrationNumber ? String(a.registrationNumber).trim().toUpperCase() : '';
      return aId === cleanIdc || 
             (aId.length >= 6 && aId.substring(0, 6) === cleanIdc) ||
             (aReg && aReg === cleanIdc);
    });
  }, [agents, userIdc]);

  const displayRole = useMemo(() => {
    if (!role) return '';
    if (role === 'admin') return 'Admin';
    if (currentAgent) return currentAgent.fullName;
    if (role === 'observer') {
      return userIdc ? `Agent (${userIdc})` : 'Agent';
    }
    if (role === 'secretariat') return 'Secrétariat';
    const r = role as string;
    return r.charAt(0).toUpperCase() + r.slice(1);
  }, [role, currentAgent, userIdc]);

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

      <div className="flex items-center gap-2 sm:gap-3">
        {displayRole && (
            <span className="text-sm font-semibold text-foreground hidden sm:inline-block">{displayRole}</span>
        )}
        <ChatSheet />
        <RecentActivitiesDialog />
        <DetachementSelector />
        <ThemeToggle />
        <UserNav />
      </div>
    </header>
  );
}
