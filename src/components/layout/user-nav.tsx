
'use client';

import { LogOut } from 'lucide-react';
import { useAuth, useFirestore } from '@/firebase';
import { signOut } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Clés locales contenant des données ou une identité à effacer à la déconnexion
const LOCAL_KEYS_TO_CLEAR = [
  'sbssi_offline_dashboard_v1',
  'sbssi_offline_missions_v1',
  'app-user-idc', // ancien stockage de l'identité (avant les jetons signés)
  'app-user-role',
];

export function UserNav() {
  const auth = useAuth();
  const firestore = useFirestore();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } finally {
      if (typeof window !== 'undefined') {
        // Efface les copies hors-ligne (agents, GAV, saisies…) laissées sur l'appareil
        LOCAL_KEYS_TO_CLEAR.forEach((key) => {
          try { localStorage.removeItem(key); } catch {}
        });
        try {
          await terminate(firestore);
          await clearIndexedDbPersistence(firestore);
        } catch (err) {
          console.warn('Cache Firestore non effacé :', err);
        }
        // Rechargement complet : repart d'une instance Firestore neuve
        window.location.replace('/');
      }
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleLogout}
            title="Se déconnecter"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:border-destructive/40 transition-all duration-200 shadow-sm active:scale-95 cursor-pointer"
            aria-label="Se déconnecter"
          >
            <LogOut size={16} className="stroke-[2.2]" />
            <span className="sr-only">Se déconnecter</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-semibold">
          Se déconnecter
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
