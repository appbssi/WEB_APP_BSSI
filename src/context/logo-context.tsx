
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

const DEFAULT_LOGO = '/logo.png?v=sBSSI_2026';

const isInvalidLogoUrl = (url?: string | null): boolean => {
  if (!url) return true;
  if (url.includes('imgur.com')) return true;
  if (url.includes('v4p7NtMh/dd.png')) return true;
  if (url.includes('aconvert.com')) return true;
  return false;
};

export function LogoProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'settings', 'app') : null),
    [firestore, user]
  );
  
  const { data: settingsData, isLoading: isDocLoading } = useDoc<{ logo: string }>(settingsDocRef);
  
  const [logo, setLogoState] = useState<string | null>(DEFAULT_LOGO);

  useEffect(() => {
    if (settingsData && settingsData.logo && !isInvalidLogoUrl(settingsData.logo) && settingsData.logo.startsWith('http')) {
      setLogoState(settingsData.logo);
    } else {
      setLogoState(DEFAULT_LOGO);
      if (firestore && user && settingsData?.logo && isInvalidLogoUrl(settingsData.logo)) {
        const settingsRef = doc(firestore, 'settings', 'app');
        setDoc(settingsRef, { logo: DEFAULT_LOGO }).catch(() => {});
      }
    }
  }, [settingsData, isDocLoading, firestore, user]);

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
