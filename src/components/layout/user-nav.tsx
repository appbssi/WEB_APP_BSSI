
'use client';

import { LogOut } from 'lucide-react';
import { useAuth } from '@/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { clearRole } from '@/hooks/use-role';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function UserNav() {
  const auth = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('app-user-idc');
    }
    clearRole();
    router.push('/');
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
