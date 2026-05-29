
'use client';

import { useState, useEffect } from 'react';

type Role = 'admin' | 'observer' | 'secretariat' | null;

const ROLE_STORAGE_KEY = 'app-user-role';

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
