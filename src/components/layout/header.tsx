
'use client';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserNav } from './user-nav';
import { RecentActivitiesDialog } from '../dashboard/recent-activities-dialog';
import { ChatSheet } from '../chat/chat-sheet';
import { DetachementSelector } from './detachement-selector';
import { ThemeToggle } from './theme-toggle';
import { Button } from '../ui/button';
import { useRole } from '@/hooks/use-role';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, QrCode } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { collection, query, where, doc } from 'firebase/firestore';
import { setDoc } from '@/lib/firestore-fast';
import type { Demande, Agent, Mission } from '@/lib/types';
import { AgentQRBadgeDialog } from '../agents/agent-qr-badge-dialog';

function NotificationBell() {
  const { role, idc: userIdc } = useRole();
  const firestore = useFirestore();
  const router = useRouter();

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
  const { role, idc: userIdc, agentId } = useRole();
  const firestore = useFirestore();
  const [isMyBadgeOpen, setIsMyBadgeOpen] = useState(false);

  // Seule la fiche de l'agent connecté est chargée (identifiant fourni par le jeton signé)
  const agentRef = useMemoFirebase(
    () => (firestore && agentId ? doc(firestore, 'agents', agentId) : null),
    [firestore, agentId]
  );
  const { data: currentAgent } = useDoc<Agent>(agentRef);

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
    <header className="sticky top-0 z-10 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between gap-4 border-b border-border bg-background px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
            <div className="md:hidden">
                <SidebarTrigger />
            </div>
        </div>

        <div className="flex flex-1 justify-end">
            {/* Espace réservé pour d'éventuels éléments futurs */}
        </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {currentAgent && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsMyBadgeOpen(true)}
                  className="h-9 gap-1.5 rounded-full border-primary/30 text-primary hover:bg-primary/10 cursor-pointer shadow-sm px-2.5 sm:px-3"
                  aria-label="Mon Badge & Code QR d'Identification"
                >
                  <QrCode className="h-4 w-4 shrink-0" />
                  <span className="hidden md:inline text-xs font-semibold">Mon QR</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs font-semibold">Mon Badge &amp; Code QR d&apos;Identification</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {/* Outils : messagerie, notifications, détachement, thème */}
        <div className="flex items-center gap-0.5 rounded-full border bg-card p-1 shadow-sm">
          <ChatSheet />
          <RecentActivitiesDialog />
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
          <DetachementSelector />
          <ThemeToggle />
        </div>

        {/* Utilisateur connecté + déconnexion */}
        <div className="flex items-center gap-1 rounded-full border bg-card p-1 shadow-sm sm:pl-1">
          {displayRole && (
            <span className="hidden items-center gap-2 pr-1 sm:inline-flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold uppercase text-primary">
                {displayRole.charAt(0)}
              </span>
              <span className="max-w-[10rem] truncate text-sm font-semibold text-foreground">{displayRole}</span>
            </span>
          )}
          <UserNav />
        </div>
      </div>
      {currentAgent && (
        <AgentQRBadgeDialog
          agent={currentAgent}
          isOpen={isMyBadgeOpen}
          onOpenChange={setIsMyBadgeOpen}
        />
      )}
    </header>
  );
}
