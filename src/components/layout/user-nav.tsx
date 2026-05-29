
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
    <button onClick={handleLogout} className="logout-btn">
      <div className="logout-sign">
        <LogOut size={17} />
      </div>
      <div className="logout-text">Se déconnecter</div>
    </button>
  );
}
