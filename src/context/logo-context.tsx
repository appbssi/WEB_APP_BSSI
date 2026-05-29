
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc, DocumentData } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase/provider';

interface LogoContextType {
  logo: string | null;
  setLogo: (logo: string | null) => void;
  isLogoLoading: boolean;
}

const LogoContext = createContext<LogoContextType | undefined>(undefined);

export function LogoProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'settings', 'app') : null),
    [firestore, user]
  );
  
  const { data: settingsData, isLoading: isDocLoading } = useDoc<{ logo: string }>(settingsDocRef);
  
  const [logo, setLogoState] = useState<string | null>(null);

  useEffect(() => {
    if (settingsData && settingsData.logo && !settingsData.logo.includes('imgur.com') && settingsData.logo.startsWith('http')) {
      setLogoState(settingsData.logo);
    } else {
      // Use a cache-buster query parameter to force browser refresh for logo.png changes
      const defaultLogo = '/logo.png?v=sBSSI_2026';
      setLogoState(defaultLogo);
    }
  }, [settingsData, isDocLoading]);

  const setLogo = useCallback((newLogo: string | null) => {
    if (newLogo) {
      if (!firestore || !user) {
        toast({
          variant: 'destructive',
          title: 'Erreur',
          description: "Impossible d'enregistrer le logo. Utilisateur non connecté.",
        });
        return;
      }
      
      const settingsRef = doc(firestore, 'settings', 'app');
      setDoc(settingsRef, { logo: newLogo })
        .then(() => {
          setLogoState(newLogo);
        })
        .catch((error) => {
          toast({
            variant: 'destructive',
            title: 'Erreur de sauvegarde du logo',
            description: error.message,
          });
        });
    }
  }, [firestore, user, toast]);

  const isLogoLoading = isUserLoading || isDocLoading;

  return (
    <LogoContext.Provider value={{ logo, setLogo, isLogoLoading }}>
      {children}
    </LogoContext.Provider>
  );
}

export function useLogo() {
  const context = useContext(LogoContext);
  if (context === undefined) {
    throw new Error('useLogo must be used within a LogoProvider');
  }
  return context;
}
