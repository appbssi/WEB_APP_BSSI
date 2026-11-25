'use client';

import { useEffect, useRef } from 'react';
import { collection, doc, increment, query, runTransaction, Timestamp, where } from 'firebase/firestore';

import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useRole } from '@/hooks/use-role';
import { logActivity } from '@/lib/activity-logger';
import { shouldAutoClose } from '@/lib/mission-deadlines';
import type { Mission } from '@/lib/types';

const CHECK_INTERVAL_MS = 60_000;

/**
 * Clôture automatiquement les missions échues depuis plus d'une heure.
 *
 * Tourne en arrière-plan tant qu'un administrateur a l'application ouverte (sur n'importe quelle page).
 * Chaque clôture est une transaction : la mission est relue avant d'être close, donc deux administrateurs
 * connectés en même temps ne la clôturent (et n'incrémentent les compteurs) qu'une seule fois.
 */
export function MissionAutoCloser() {
  const firestore = useFirestore();
  const { isAdmin } = useRole();

  // Seules les missions encore ouvertes peuvent être concernées
  const openMissionsQuery = useMemoFirebase(
    () =>
      firestore && isAdmin
        ? query(collection(firestore, 'missions'), where('status', 'in', ['Planification', 'En cours']))
        : null,
    [firestore, isAdmin],
  );
  const { data: openMissions } = useCollection<Mission>(openMissionsQuery);

  const missionsRef = useRef<Mission[]>([]);
  missionsRef.current = openMissions ?? [];
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!firestore || !isAdmin) return;

    const closeOverdue = () => {
      const now = new Date();
      for (const m of missionsRef.current) {
        if (inFlight.current.has(m.id) || !shouldAutoClose(m, now)) continue;
        inFlight.current.add(m.id);

        const missionRef = doc(firestore, 'missions', m.id);
        runTransaction(firestore, async (tx) => {
          const snap = await tx.get(missionRef);
          if (!snap.exists()) return false;
          const fresh = { id: snap.id, ...snap.data() } as Mission;
          // Re-vérifiée dans la transaction : déjà close ou prolongée entre-temps → rien à faire
          if (!shouldAutoClose(fresh, new Date())) return false;

          const agentSnaps = await Promise.all(
            (fresh.assignedAgentIds || []).map((id) => tx.get(doc(firestore, 'agents', id))),
          );

          tx.update(missionRef, { status: 'Terminée', closedAutomatically: true, closedAt: Timestamp.now() });
          // Les agents supprimés entre-temps sont ignorés
          for (const a of agentSnaps) {
            if (a.exists()) tx.update(a.ref, { missionCount: increment(1) });
          }
          return true;
        })
          .then((closed) => {
            if (closed) {
              logActivity(firestore, `Mission clôturée automatiquement (échue depuis plus d'1 h) : ${m.name}`, 'Mission', '/missions');
            }
          })
          .catch((err) => {
            // Hors ligne ou refus : nouvel essai à la prochaine vérification
            console.warn('Clôture automatique impossible pour la mission', m.id, err);
          })
          .finally(() => inFlight.current.delete(m.id));
      }
    };

    closeOverdue();
    const interval = setInterval(closeOverdue, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [firestore, isAdmin, openMissions]);

  return null;
}
