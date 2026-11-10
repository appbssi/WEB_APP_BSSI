'use client';

import React from 'react';
import { WifiOff, Wifi, RefreshCw, Database } from 'lucide-react';
import { useOfflineStatus } from '@/lib/offline-cache';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function OfflineBanner() {
  const { isOnline, wasOffline, formattedSyncTime } = useOfflineStatus();

  // If online and was not recently offline, don't show anything
  if (isOnline && !wasOffline) {
    return null;
  }

  // Back online notice
  if (isOnline && wasOffline) {
    return (
      <div className="bg-emerald-600/90 text-white px-4 py-2 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 shadow-md animate-fade-in backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2 mx-auto">
          <Wifi className="w-4 h-4 animate-pulse text-emerald-200" />
          <span>Connexion Internet rétablie — Synchronisation temps réel active</span>
        </div>
      </div>
    );
  }

  // Offline banner
  return (
    <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-orange-700 text-white px-4 py-2.5 text-xs sm:text-sm font-medium flex flex-wrap items-center justify-between gap-2 shadow-lg backdrop-blur-md sticky top-0 z-50 border-b border-amber-500/30">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-black/20 flex items-center justify-center shrink-0">
          <WifiOff className="w-4 h-4 text-amber-200 animate-pulse" />
        </div>
        <div className="truncate">
          <span className="font-bold uppercase tracking-wider mr-2 text-amber-100">Mode Hors-Ligne :</span>
          <span>Vous consultez les données sécurisées du cache local (Tableau de bord & Missions).</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
        <Badge variant="outline" className="bg-black/20 border-white/20 text-white text-[11px] gap-1.5 font-normal py-0.5">
          <Database className="w-3 h-3 text-amber-200" />
          <span>Synchro : {formattedSyncTime}</span>
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => window.location.reload()}
          className="h-7 px-2 text-xs bg-white/10 hover:bg-white/20 text-white cursor-pointer rounded-lg gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          <span className="hidden sm:inline">Actualiser</span>
        </Button>
      </div>
    </div>
  );
}
