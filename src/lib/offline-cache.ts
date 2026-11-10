'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Agent, Mission, Detainee, Demande, Saisie } from '@/lib/types';

export interface DashboardOfflineData {
  agents: Agent[];
  missions: Mission[];
  detainees: Detainee[];
  demandes: Demande[];
  saisies: Saisie[];
  cachedAt: number;
}

export interface MissionsOfflineData {
  missions: Mission[];
  agents: Agent[];
  cachedAt: number;
}

const DASHBOARD_CACHE_KEY = 'sbssi_offline_dashboard_v1';
const MISSIONS_CACHE_KEY = 'sbssi_offline_missions_v1';

/**
 * Saves dashboard datasets to localStorage for offline viewing.
 */
export function saveDashboardOfflineCache(data: {
  agents?: Agent[] | null;
  missions?: Mission[] | null;
  detainees?: Detainee[] | null;
  demandes?: Demande[] | null;
  saisies?: Saisie[] | null;
}): void {
  if (typeof window === 'undefined') return;

  try {
    // Only cache if we actually have meaningful data
    const existing = getDashboardOfflineCache();
    const payload: DashboardOfflineData = {
      agents: (data.agents && data.agents.length > 0) ? data.agents : (existing?.agents || []),
      missions: (data.missions && data.missions.length > 0) ? data.missions : (existing?.missions || []),
      detainees: (data.detainees && data.detainees.length > 0) ? data.detainees : (existing?.detainees || []),
      demandes: (data.demandes && data.demandes.length > 0) ? data.demandes : (existing?.demandes || []),
      saisies: (data.saisies && data.saisies.length > 0) ? data.saisies : (existing?.saisies || []),
      cachedAt: Date.now(),
    };

    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[OfflineCache] Failed to save dashboard cache to localStorage:', error);
  }
}

/**
 * Retrieves cached dashboard data from localStorage.
 */
export function getDashboardOfflineCache(): DashboardOfflineData | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed: DashboardOfflineData = JSON.parse(raw);
    return parsed;
  } catch (error) {
    console.warn('[OfflineCache] Failed to parse dashboard cache:', error);
    return null;
  }
}

/**
 * Saves missions dataset to localStorage for offline viewing.
 */
export function saveMissionsOfflineCache(data: {
  missions?: Mission[] | null;
  agents?: Agent[] | null;
}): void {
  if (typeof window === 'undefined') return;

  try {
    const existing = getMissionsOfflineCache();
    const payload: MissionsOfflineData = {
      missions: (data.missions && data.missions.length > 0) ? data.missions : (existing?.missions || []),
      agents: (data.agents && data.agents.length > 0) ? data.agents : (existing?.agents || []),
      cachedAt: Date.now(),
    };

    localStorage.setItem(MISSIONS_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[OfflineCache] Failed to save missions cache:', error);
  }
}

/**
 * Retrieves cached missions dataset from localStorage.
 */
export function getMissionsOfflineCache(): MissionsOfflineData | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(MISSIONS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MissionsOfflineData;
  } catch (error) {
    console.warn('[OfflineCache] Failed to parse missions cache:', error);
    return null;
  }
}

/**
 * Format timestamp into human readable relative or full date (in French).
 */
export function formatCacheAge(timestamp?: number): string {
  if (!timestamp) return 'Non synchronisé';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'à l’instant';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `il y a ${diffHours} h`;
  const date = new Date(timestamp);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Custom React Hook to track online/offline connectivity and cache status.
 */
export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    // Initial check for latest cached timestamp
    const dashCache = getDashboardOfflineCache();
    const missCache = getMissionsOfflineCache();
    const latest = Math.max(dashCache?.cachedAt || 0, missCache?.cachedAt || 0);
    if (latest > 0) {
      setLastSyncTime(latest);
    }

    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      // Auto-hide the "reconnected" badge after 4 seconds
      setTimeout(() => setWasOffline(false), 4000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshSyncTime = useCallback((time: number = Date.now()) => {
    setLastSyncTime(time);
  }, []);

  return {
    isOnline,
    wasOffline,
    lastSyncTime,
    formattedSyncTime: formatCacheAge(lastSyncTime || undefined),
    refreshSyncTime,
  };
}
