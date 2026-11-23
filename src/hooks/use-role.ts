'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';

export type Role = 'admin' | 'observer' | 'secretariat' | null;

// --- Droits d'accès par rôle (source unique de vérité pour le menu et le garde d'accès) ---

/** Administrateurs à accès limité (jeton signé avec restricted = true). */
export const RESTRICTED_ADMIN_ALLOWED_PATHS = [
  '/dashboard',
  '/cartographie',
  '/agents',
  '/missions',
  '/logistique',
  '/gav',
  '/saisies',
] as const;

export const SECRETARIAT_ALLOWED_PATHS = [
  '/demandes',
  '/secretariat',
  '/gatherings',
  '/gav',
  '/saisies',
] as const;

export const AGENT_ALLOWED_PATHS = ['/demandes'] as const;

export function canAccessRoute(role: Role, restricted: boolean, pathname: string): boolean {
  if (role === 'admin') {
    return restricted ? RESTRICTED_ADMIN_ALLOWED_PATHS.some((p) => pathname.startsWith(p)) : true;
  }
  if (role === 'secretariat') {
    return SECRETARIAT_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
  }
  // Agent ('observer') : uniquement son espace personnel
  return AGENT_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
}

export function getDefaultRouteForUser(role: Role): string {
  return role === 'admin' ? '/dashboard' : '/demandes';
}

// --- Identité signée par le serveur ---

export interface Identity {
  role: Role;
  /** IDC saisi à la connexion (normalisé en majuscules). */
  idc: string;
  /** Identifiant du document agent correspondant, s'il existe. */
  agentId: string | null;
  /** Administrateur à accès limité. */
  restricted: boolean;
}

const EMPTY: Identity = { role: null, idc: '', agentId: null, restricted: false };

// Cache mémoire : évite un écran de chargement à chaque changement de page.
let cachedUid: string | null = null;
let cachedIdentity: Identity = EMPTY;

function isRole(v: unknown): v is Exclude<Role, null> {
  return v === 'admin' || v === 'observer' || v === 'secretariat';
}

interface UseRoleResult extends Identity {
  isRoleLoading: boolean;
  isAdmin: boolean;
  isObserver: boolean;
  isSecretariat: boolean;
}

/**
 * Rôle et identité de l'utilisateur connecté.
 *
 * Ils proviennent des « custom claims » du jeton Firebase, signés par le serveur
 * (route /api/auth/idc). Modifier le localStorage ne permet plus de changer de rôle,
 * et les règles Firestore vérifient ces mêmes informations.
 */
export function useRole(): UseRoleResult {
  const { user, isUserLoading } = useUser();
  // Identité résolue, associée à l'utilisateur (uid) pour lequel elle a été lue
  const [resolved, setResolved] = useState<{ uid: string | null; identity: Identity }>(() => ({
    uid: cachedUid,
    identity: cachedIdentity,
  }));

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      cachedUid = null;
      cachedIdentity = EMPTY;
      setResolved({ uid: null, identity: EMPTY });
      return;
    }

    if (user.uid === cachedUid) {
      setResolved({ uid: cachedUid, identity: cachedIdentity });
      return;
    }

    user
      .getIdTokenResult()
      .then((result) => {
        const c = result.claims as Record<string, unknown>;
        return isRole(c.role)
          ? {
              role: c.role,
              idc: typeof c.idc === 'string' ? c.idc : '',
              agentId: typeof c.agentId === 'string' ? c.agentId : null,
              restricted: c.restricted === true,
            }
          : EMPTY;
      })
      .catch(() => EMPTY)
      .then((next) => {
        if (cancelled) return;
        cachedUid = user.uid;
        cachedIdentity = next;
        setResolved({ uid: user.uid, identity: next });
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Calculé à chaque rendu : tant que l'identité lue ne correspond pas à l'utilisateur
  // courant, on est « en chargement » (évite de croire la session invalide juste après la connexion).
  const isClaimsLoading = !!user && resolved.uid !== user.uid;
  const identity = user && !isClaimsLoading ? resolved.identity : EMPTY;

  const role = identity.role;
  return {
    ...identity,
    isRoleLoading: isUserLoading || isClaimsLoading,
    isAdmin: role === 'admin',
    isObserver: role === 'observer',
    isSecretariat: role === 'secretariat',
  };
}
