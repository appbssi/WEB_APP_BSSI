'use client';

import { useEffect, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { writeBatch } from '@/lib/firestore-fast';

import { useFirestore } from '@/firebase';
import { useRole } from '@/hooks/use-role';

/**
 * Les agents ne doivent recevoir que la version SIGNÉE de leur ordre de mission.
 *
 * Les ordres générés avant cette règle portaient les agents dans `agentIds`, ce qui les rendait
 * visibles dans l'Espace Agent. Au chargement d'une session administrateur, on déplace ces
 * identifiants dans `assignedAgentIds` et on vide `agentIds` : l'ordre non signé n'est plus
 * accessible aux agents (règles Firestore), et l'administration garde la liste des agents.
 */
export function UnsignedOrdersGuard() {
  const firestore = useFirestore();
  const { isAdmin } = useRole();
  const done = useRef(false);

  useEffect(() => {
    if (!firestore || !isAdmin || done.current) return;
    done.current = true;

    getDocs(query(collection(firestore, 'pdf_documents'), where('type', '==', 'ordre_de_mission')))
      .then(async (snap) => {
        const toFix = snap.docs.filter((d) => {
          const ids = d.data().agentIds;
          return Array.isArray(ids) && ids.length > 0;
        });
        // Lots de 400 écritures (limite Firestore : 500 par lot)
        for (let i = 0; i < toFix.length; i += 400) {
          const batch = writeBatch(firestore);
          for (const d of toFix.slice(i, i + 400)) {
            const data = d.data();
            const assigned: string[] = Array.isArray(data.assignedAgentIds) && data.assignedAgentIds.length
              ? data.assignedAgentIds
              : data.agentIds;
            batch.update(d.ref, { agentIds: [], assignedAgentIds: assigned });
          }
          await batch.commit();
        }
      })
      .catch((err) => {
        done.current = false; // nouvel essai au prochain chargement
        console.warn('Retrait des ordres non signés de l’Espace Agent impossible :', err);
      });
  }, [firestore, isAdmin]);

  return null;
}
