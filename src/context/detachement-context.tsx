'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type DetachementContextType = {
  selectedDetachement: string;
  setSelectedDetachement: (detachement: string) => void;
};

const DetachementContext = createContext<DetachementContextType>({
  selectedDetachement: 'ALL',
  setSelectedDetachement: () => {},
});

export function DetachementProvider({ children }: { children: React.ReactNode }) {
  const [selectedDetachement, setSelectedDetachementState] = useState<string>('ALL');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('app-selected-detachement');
      if (saved) {
        setSelectedDetachementState(saved);
      }
    }
  }, []);

  const setSelectedDetachement = (detachement: string) => {
    setSelectedDetachementState(detachement);
    if (typeof window !== 'undefined') {
      localStorage.setItem('app-selected-detachement', detachement);
    }
  };

  return (
    <DetachementContext.Provider value={{ selectedDetachement, setSelectedDetachement }}>
      {children}
    </DetachementContext.Provider>
  );
}

export function useDetachement() {
  return useContext(DetachementContext);
}
