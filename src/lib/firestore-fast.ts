'use client';

/**
 * Écritures Firestore « instantanées ».
 *
 * Firestore applique toute écriture au cache local tout de suite (les écrans abonnés
 * se mettent à jour aussitôt), puis l'envoie au serveur. Attendre l'accusé du serveur
 * fait patienter l'utilisateur une demi-seconde ou plus, et indéfiniment hors connexion.
 *
 * Ces fonctions remplacent celles de 'firebase/firestore' : elles rendent la main dès que
 * le serveur a répondu OU après FAST_WRITE_MS au plus. Une erreur rapide (droits refusés,
 * données invalides) est levée normalement ; une erreur qui arrive plus tard est signalée
 * par une notification, et Firestore annule alors la modification locale.
 */

import {
  addDoc as fsAddDoc,
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  deleteDoc as fsDeleteDoc,
  writeBatch as fsWriteBatch,
  doc,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type WithFieldValue,
  type WriteBatch,
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';

export const FAST_WRITE_MS = 350;

function reportLateError(err: unknown) {
  console.error('[Firestore] Écriture refusée après coup :', err);
  const denied = (err as { code?: string })?.code === 'permission-denied';
  toast({
    variant: 'destructive',
    title: "Modification non enregistrée",
    description: denied
      ? "Le serveur a refusé cette opération (droits insuffisants). Elle a été annulée."
      : "Le serveur n'a pas pu enregistrer la dernière opération. Elle a été annulée, réessayez.",
  });
}

/** Attend la fin de l'écriture au plus FAST_WRITE_MS, puis la laisse se terminer en arrière-plan. */
export async function settleFast<T>(write: Promise<T>): Promise<T | undefined> {
  let settled = false;
  const tracked = write.then(
    (v) => { settled = true; return v; },
    (e) => { settled = true; throw e; },
  );
  const PENDING = Symbol('pending');
  const winner = await Promise.race([
    tracked,
    new Promise<typeof PENDING>((resolve) => setTimeout(() => resolve(PENDING), FAST_WRITE_MS)),
  ]);
  if (winner === PENDING && !settled) {
    tracked.catch(reportLateError);
    return undefined;
  }
  return winner as T;
}

/** Comme addDoc, mais l'identifiant est créé localement : la référence est rendue sans attendre. */
export async function addDoc<T = DocumentData>(
  ref: CollectionReference<T>,
  data: WithFieldValue<T>,
): Promise<DocumentReference<T>> {
  const newRef = doc(ref);
  await settleFast(fsSetDoc(newRef, data));
  return newRef;
}

export const setDoc = ((...args: Parameters<typeof fsSetDoc>) =>
  settleFast((fsSetDoc as (...a: unknown[]) => Promise<void>)(...args)).then(() => undefined)) as typeof fsSetDoc;

export const updateDoc = ((...args: Parameters<typeof fsUpdateDoc>) =>
  settleFast((fsUpdateDoc as (...a: unknown[]) => Promise<void>)(...args)).then(() => undefined)) as typeof fsUpdateDoc;

export const deleteDoc: typeof fsDeleteDoc = (ref) => settleFast(fsDeleteDoc(ref)).then(() => undefined);

/** Lot d'écritures dont commit() rend la main aussi vite que les fonctions ci-dessus. */
export function writeBatch(firestore: Firestore): WriteBatch {
  const batch = fsWriteBatch(firestore);
  const commit = batch.commit.bind(batch);
  batch.commit = () => settleFast(commit()).then(() => undefined);
  return batch;
}
