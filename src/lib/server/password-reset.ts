import 'server-only';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';

/**
 * Mot de passe oublié (sans SMS) :
 * 1. l'agent donne son IDC et son matricule ;
 * 2. un code à 6 chiffres est créé ; l'administrateur le voit dans le tableau de bord
 *    et le transmet à l'agent sur son contact enregistré (appel, WhatsApp) ;
 * 3. l'agent saisit le code et choisit un nouveau mot de passe.
 *
 * `_password_resets/{agentId}` : empreinte du code (serveur uniquement).
 * `password_reset_requests/{agentId}` : demande lisible par les administrateurs (avec le code à transmettre).
 */
export const RESET_CODE_TTL_MS = 2 * 60 * 60 * 1000; // 2 h : le code est transmis à la main
export const RESET_MAX_ATTEMPTS = 5;

export function normalizeMatricule(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function generateResetCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashCode(agentId: string, code: string): string {
  return createHash('sha256').update(`sbssi-reset:${agentId}:${code}`).digest('hex');
}

/** Masque un numéro : « 07 •• •• •• 45 » */
export function maskContact(contact: string): string {
  const digits = contact.replace(/\D/g, '');
  if (digits.length < 4) return '•••';
  return `${digits.slice(0, 2)} •• •• •• ${digits.slice(-2)}`;
}

export type AgentResetInfo = {
  agentId: string;
  fullName: string;
  rank: string;
  registrationNumber: string;
  contact: string;
};

export async function getAgentResetInfo(agentId: string): Promise<AgentResetInfo | null> {
  const snap = await adminDb().collection('agents').doc(agentId).get();
  if (!snap.exists) return null;
  const d = snap.data() as Record<string, unknown>;
  return {
    agentId,
    fullName: String(d.fullName ?? ''),
    rank: String(d.rank ?? ''),
    registrationNumber: String(d.registrationNumber ?? ''),
    contact: String(d.contact ?? ''),
  };
}

/** Crée (ou remplace) la demande de réinitialisation ; renvoie le code en clair. */
export async function createResetRequest(info: AgentResetInfo): Promise<string> {
  const code = generateResetCode();
  const expiresAt = Date.now() + RESET_CODE_TTL_MS;
  const db = adminDb();
  const batch = db.batch();
  batch.set(db.collection('_password_resets').doc(info.agentId), {
    codeHash: hashCode(info.agentId, code),
    expiresAt,
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection('password_reset_requests').doc(info.agentId), {
    agentId: info.agentId,
    agentName: info.fullName,
    rank: info.rank,
    registrationNumber: info.registrationNumber,
    contact: info.contact,
    code,
    expiresAt,
    status: 'a_transmettre',
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return code;
}

export type CodeCheck = 'ok' | 'invalid' | 'expired' | 'none' | 'locked';

/** Vérifie le code ; chaque échec est compté, et le code est détruit après 5 échecs. */
export async function checkResetCode(agentId: string, code: string): Promise<CodeCheck> {
  const db = adminDb();
  const ref = db.collection('_password_resets').doc(agentId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'none';
    const { codeHash, expiresAt = 0, attempts = 0 } = snap.data() as {
      codeHash?: string;
      expiresAt?: number;
      attempts?: number;
    };
    if (Date.now() > expiresAt) return 'expired';
    if (attempts >= RESET_MAX_ATTEMPTS) return 'locked';

    const expected = Buffer.from(String(codeHash ?? ''), 'hex');
    const given = Buffer.from(hashCode(agentId, code.trim()), 'hex');
    if (expected.length === given.length && timingSafeEqual(expected, given)) return 'ok';

    tx.update(ref, { attempts: attempts + 1 });
    return attempts + 1 >= RESET_MAX_ATTEMPTS ? 'locked' : 'invalid';
  });
}

/** Remplace le mot de passe et clôt la demande (code à usage unique). */
export async function completeReset(agentId: string, passwordHash: string): Promise<void> {
  const db = adminDb();
  const batch = db.batch();
  batch.set(db.collection('_agent_credentials').doc(agentId), {
    passwordHash,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.delete(db.collection('_password_resets').doc(agentId));
  batch.delete(db.collection('password_reset_requests').doc(agentId));
  await batch.commit();
}
