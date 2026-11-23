
'use client';

import { useState, useEffect } from 'react';

export type Role = 'admin' | 'observer' | 'secretariat' | null;

const ROLE_STORAGE_KEY = 'app-user-role';

export const SPECIAL_IDCS = ['VUCE1Z', 'CQZSBH', 'QXTSLG'] as const;

export const SPECIAL_ALLOWED_PATHS = [
  '/dashboard',
  '/cartographie',
  '/agents',
  '/missions',
  '/logistique',
  '/gav',
  '/saisies',
  '/tutoriel',
] as const;

export const SECRETARIAT_ALLOWED_PATHS = [
  '/demandes',
  '/secretariat',
  '/gatherings',
  '/gav',
  '/saisies',
  '/tutoriel',
] as const;

export const AGENT_ALLOWED_PATHS = [
  '/demandes',
  '/tutoriel',
] as const;

export function isSpecialOfficerIdc(idc?: string | null): boolean {
  if (!idc) return false;
  return (SPECIAL_IDCS as readonly string[]).includes(idc.trim().toUpperCase());
}

export function canAccessRoute(role: Role, userIdc: string | null | undefined, pathname: string): boolean {
  if (isSpecialOfficerIdc(userIdc)) {
    return SPECIAL_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
  }
  if (role === 'admin') {
    return true;
  }
  if (role === 'secretariat') {
    return SECRETARIAT_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
  }
  // Ordinary agent ('observer') or unprivileged user: strictly restricted to personal space and guide
  return AGENT_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
}

export function getDefaultRouteForUser(role: Role, userIdc?: string | null): string {
  if (role === 'admin' || isSpecialOfficerIdc(userIdc)) {
    return '/dashboard';
  }
  return '/demandes';
}

// --- State Management outside of React ---
let memoryState: Role = null;

// Function to set the role and persist it
export function setRole(newRole: Role) {
  memoryState = newRole;
  try {
    if (typeof window !== 'undefined') {
      if (newRole) {
        localStorage.setItem(ROLE_STORAGE_KEY, newRole);
      } else {
        localStorage.removeItem(ROLE_STORAGE_KEY);
      }
    }
  } catch (error) {
    console.error("Failed to write role to localStorage", error);
  }
  // Notify listeners about the change
  listeners.forEach((listener) => listener(newRole));
}

export function clearRole() {
  setRole(null);
}

// --- Listener setup to update React components ---
const listeners: Array<(role: Role) => void> = [];

function subscribe(callback: (role: Role) => void) {
  listeners.push(callback);
  return function unsubscribe() {
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}

// --- React Hook ---
interface UseRoleResult {
  role: Role;
  isRoleLoading: boolean;
  isAdmin: boolean;
  isObserver: boolean;
  isSecretariat: boolean;
}

// Initialize state from localStorage on script load
if (typeof window !== 'undefined') {
  try {
      const savedRole = localStorage.getItem(ROLE_STORAGE_KEY);
      if (savedRole === 'admin' || savedRole === 'observer' || savedRole === 'secretariat') {
          memoryState = savedRole;
      }
  } catch (error) {
      console.error("Failed to read role from localStorage on init", error);
  }
}


export function useRole(): UseRoleResult {
  const [role, setRoleState] = useState<Role>(memoryState);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // This effect runs once on mount to ensure we have the correct initial value
    // in case it was set from another tab after this script loaded.
    if (typeof window !== 'undefined') {
      try {
          const savedRole = localStorage.getItem(ROLE_STORAGE_KEY) as Role;
          if (['admin', 'observer', 'secretariat'].includes(savedRole as string)) {
              if(memoryState !== savedRole) {
                  memoryState = savedRole;
              }
          } else {
              memoryState = null;
          }
      } catch(e) {
          memoryState = null;
      }
    }
    setRoleState(memoryState);
    setIsInitialized(true);
    
    // Subscribe to future changes
    const unsubscribe = subscribe(setRoleState);
    return unsubscribe;
  }, []);

  return { 
    role, 
    isRoleLoading: !isInitialized,
    isAdmin: role === 'admin',
    isObserver: role === 'observer',
    isSecretariat: role === 'secretariat',
  };
}
