'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { doc } from 'firebase/firestore';
import { X } from 'lucide-react';

import { useFirestore, useMemoFirebase } from '@/firebase';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useRole } from '@/hooks/use-role';
import type { Agent } from '@/lib/types';

/** Posé par la page de connexion juste après une connexion réussie */
export const WELCOME_PENDING_KEY = 'sbssi-welcome-pending';
/** Durée d'affichage avant disparition automatique */
const DISPLAY_MS = 4500;
const EXIT_MS = 400;

function greeting(date: Date) {
  const h = date.getHours();
  if (h < 5 || h >= 18) return 'Bonsoir';
  return 'Bonjour';
}

/** Fenêtre de bienvenue affichée une fois, après la connexion d'un agent. */
export function AgentWelcome() {
  const { role, agentId } = useRole();
  const firestore = useFirestore();
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<'hidden' | 'shown' | 'leaving'>('hidden');

  // Lu une seule fois : la fenêtre n'apparaît qu'après une vraie connexion, pas à chaque rechargement
  useEffect(() => {
    try {
      if (sessionStorage.getItem(WELCOME_PENDING_KEY)) setPending(true);
    } catch {
      // stockage indisponible : pas de fenêtre
    }
  }, []);

  const agentRef = useMemoFirebase(
    () => (pending && firestore && role === 'observer' && agentId ? doc(firestore, 'agents', agentId) : null),
    [pending, firestore, role, agentId]
  );
  const { data: agent } = useDoc<Agent>(agentRef);

  // Les administrateurs et le secrétariat ne sont pas concernés : on efface simplement le signal
  useEffect(() => {
    if (pending && role && role !== 'observer') {
      try {
        sessionStorage.removeItem(WELCOME_PENDING_KEY);
      } catch {}
      setPending(false);
    }
  }, [pending, role]);

  useEffect(() => {
    if (!pending || !agent || phase !== 'hidden') return;
    try {
      sessionStorage.removeItem(WELCOME_PENDING_KEY);
    } catch {}
    setPhase('shown');
  }, [pending, agent, phase]);

  useEffect(() => {
    if (phase === 'shown') {
      const t = setTimeout(() => setPhase('leaving'), DISPLAY_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'leaving') {
      const t = setTimeout(() => {
        setPhase('hidden');
        setPending(false);
      }, EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [phase]);

  if (!agent || phase === 'hidden') return null;

  const initials = agent.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm transition-opacity duration-300 ${
        phase === 'leaving' ? 'opacity-0' : 'opacity-100 animate-in fade-in'
      }`}
      onClick={() => setPhase('leaving')}
    >
      <div
        role="status"
        aria-live="polite"
        className={`relative w-full max-w-sm overflow-hidden rounded-2xl border bg-card text-center shadow-2xl transition-all duration-300 ${
          phase === 'leaving' ? 'scale-95 opacity-0' : 'animate-in zoom-in-95'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-16 bg-gradient-to-r from-primary/80 to-primary" />
        <button
          type="button"
          onClick={() => setPhase('leaving')}
          className="absolute right-2 top-2 rounded-full p-1 text-white/80 hover:bg-white/20 hover:text-white"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="-mt-10 flex justify-center">
          {agent.photo ? (
            <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-card bg-muted shadow-md">
              <Image src={agent.photo} alt={agent.fullName} fill className="object-cover" />
            </div>
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-card bg-primary/10 text-2xl font-bold text-primary shadow-md">
              {initials}
            </div>
          )}
        </div>

        <div className="space-y-1 px-6 pb-5 pt-3">
          <p className="text-sm text-muted-foreground">{greeting(new Date())},</p>
          <p className="text-xl font-bold leading-tight text-foreground">
            {agent.rank ? `${agent.rank} ` : ''}
            {agent.fullName}
          </p>
          <p className="pt-1 text-sm text-muted-foreground">Bienvenue dans votre espace agent.</p>
        </div>

        {/* Compte à rebours avant fermeture automatique */}
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary"
            style={{ animation: `agent-welcome-countdown ${DISPLAY_MS}ms linear forwards` }}
          />
        </div>
        <style>{`@keyframes agent-welcome-countdown { from { width: 100%; } to { width: 0%; } }`}</style>
      </div>
    </div>
  );
}
