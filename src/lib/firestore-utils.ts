
'use client';

import { collection, getDocs, writeBatch, Firestore, doc, deleteDoc, WriteBatch, query, orderBy, where, updateDoc } from "firebase/firestore";
import type { Agent, Mission } from "./types";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { logActivity } from "./activity-logger";


/**
 * Finds and deletes duplicate agents from Firestore based on the registrationNumber.
 * @param firestore - The Firestore instance.
 * @returns The number of duplicate documents deleted.
 */
export async function deleteDuplicateAgents(firestore: Firestore): Promise<number> {
  const agentsRef = collection(firestore, 'agents');
  const snapshot = await getDocs(agentsRef);
  const agents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Agent));

  const registrationMap = new Map<string, string[]>();

  // Group agents by registration number
  for (const agent of agents) {
    if (agent.registrationNumber) {
      if (!registrationMap.has(agent.registrationNumber)) {
        registrationMap.set(agent.registrationNumber, []);
      }
      registrationMap.get(agent.registrationNumber)!.push(agent.id);
    }
  }

  const batch = writeBatch(firestore);
  let duplicatesDeleted = 0;

  // Identify and mark duplicates for deletion
  for (const [registrationNumber, ids] of registrationMap.entries()) {
    if (ids.length > 1) {
      // Keep the first one, delete the rest
      const idsToDelete = ids.slice(1);
      for (const id of idsToDelete) {
        const docRef = doc(firestore, 'agents', id);
        batch.delete(docRef);
        duplicatesDeleted++;
      }
    }
  }

  // Commit the deletions if any
  if (duplicatesDeleted > 0) {
     batch.commit().then(() => {
        logActivity(firestore, `${duplicatesDeleted} agent(s) en double ont été supprimés.`, 'Agent', '/agents');
     }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: 'agents/[multiple]', // Generic path for batch operation
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  }

  return duplicatesDeleted;
}

export async function deleteDuplicateAgentsByName(firestore: Firestore): Promise<number> {
  const agentsRef = collection(firestore, 'agents');
  const snapshot = await getDocs(agentsRef);
  
  const agentsByName = new Map<string, Agent[]>();

  // Group agents by full name (case insensitive)
  snapshot.docs.forEach(docSnap => {
    const agent = { id: docSnap.id, ...docSnap.data() } as Agent;
    if (agent.fullName) {
      const nameKey = agent.fullName.trim().toLowerCase();
      const existing = agentsByName.get(nameKey) || [];
      existing.push(agent);
      agentsByName.set(nameKey, existing);
    }
  });

  const batch = writeBatch(firestore);
  let duplicatesDeleted = 0;

  for (const [name, agents] of agentsByName.entries()) {
    if (agents.length > 1) {
      // Keep the first one, delete others
      const agentsToDelete = agents.slice(1);
      for (const agentToDelete of agentsToDelete) {
        const docRef = doc(firestore, 'agents', agentToDelete.id);
        batch.delete(docRef);
        duplicatesDeleted++;
      }
    }
  }

  if (duplicatesDeleted > 0) {
    await batch.commit().catch(serverError => {
      const permissionError = new FirestorePermissionError({
        path: 'agents/[batch]',
        operation: 'delete',
        requestResourceData: { info: "Batch delete for name deduplication" },
      });
      errorEmitter.emit('permission-error', permissionError);
      throw serverError;
    });
     logActivity(firestore, `${duplicatesDeleted} agent(s) en double par nom ont été supprimés.`, 'Agent', '/agents');
  }

  return duplicatesDeleted;
}


export function deleteAgent(firestore: Firestore, agent: Agent, missions: Mission[]) {
    if (!agent) return;

    const batch = writeBatch(firestore);
    const agentRef = doc(firestore, 'agents', agent.id);

    // Remove agent from all missions they are assigned to
    missions.forEach(mission => {
        if (mission.assignedAgentIds.includes(agent.id)) {
            const missionRef = doc(firestore, 'missions', mission.id);
            const updatedAgentIds = mission.assignedAgentIds.filter(id => id !== agent.id);
            batch.update(missionRef, { assignedAgentIds: updatedAgentIds });
        }
    });
    
    batch.delete(agentRef);

    batch.commit().then(() => {
        logActivity(firestore, `L'agent ${agent.fullName} a été supprimé.`, 'Agent', '/agents');
    }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: agentRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
    });
}

export async function updateOfficerRanks(firestore: Firestore): Promise<number> {
    if (!firestore) return 0;
    
    const agentsRef = collection(firestore, 'agents');
    const q = query(agentsRef, where("section", "==", "Officier"), where("rank", "==", "IEF"));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        return 0;
    }

    const batch = writeBatch(firestore);
    querySnapshot.forEach((docSnapshot) => {
        const agentRef = doc(firestore, 'agents', docSnapshot.id);
        batch.update(agentRef, { rank: 'OFFI' });
    });

    await batch.commit().catch(serverError => {
        const permissionError = new FirestorePermissionError({
            path: 'agents/[batch]',
            operation: 'update',
            requestResourceData: { info: "Batch update officer ranks" },
        });
        errorEmitter.emit('permission-error', permissionError);
        throw serverError;
    });

    logActivity(firestore, `${querySnapshot.size} grade(s) d'officier(s) ont été mis à jour de 'IEF' à 'OFFI'.`, 'Agent', '/agents');
    return querySnapshot.size;
}

export async function prefixContactsWithZero(firestore: Firestore): Promise<number> {
    if (!firestore) return 0;

    const agentsRef = collection(firestore, 'agents');
    const querySnapshot = await getDocs(agentsRef);

    if (querySnapshot.empty) {
        return 0;
    }

    const batch = writeBatch(firestore);
    let updatedCount = 0;

    querySnapshot.forEach((docSnapshot) => {
        const agent = docSnapshot.data() as Agent;
        const agentId = docSnapshot.id;

        if (agent.contact && !agent.contact.startsWith('0')) {
            const agentRef = doc(firestore, 'agents', agentId);
            batch.update(agentRef, { contact: `0${agent.contact}` });
            updatedCount++;
        }
    });

    if (updatedCount > 0) {
        await batch.commit().catch(serverError => {
            const permissionError = new FirestorePermissionError({
                path: 'agents/[batch]',
                operation: 'update',
                requestResourceData: { info: "Batch update contacts" },
            });
            errorEmitter.emit('permission-error', permissionError);
            throw serverError;
        });
        logActivity(firestore, `${updatedCount} contact(s) ont été préfixés avec un '0'.`, 'Agent', '/agents');
    }

    return updatedCount;
}
