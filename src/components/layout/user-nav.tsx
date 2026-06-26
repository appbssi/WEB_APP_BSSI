
'use client';

import { LogOut } from 'lucide-react';
import { useAuth } from '@/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { clearRole } from '@/hooks/use-role';

export function UserNav() {
  const auth = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    clearRole();
    router.push('/');
  };

  return (
    <button
      onClick={handleLogout}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:border-destructive/35 transition-all duration-200 text-xs font-bold tracking-tight shadow-sm active:scale-95 cursor-pointer"
    >
      <LogOut size={14} className="stroke-[2.5]" />
      <span>Se déconnecter</span>
    </button>
  );
}
