import 'server-only';
import { createHash } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';

export type AppRole = 'admin' | 'secretariat' | 'observer';

export interface IdcIdentity {
  role: AppRole;
  idc: string;
  /** Identifiant du document de l'agent, si l'IDC correspond à un agent. */
  agentId: string | null;
  /** Administrateur à accès limité (certaines rubriques seulement). */
  restricted: boolean;
}

/** Normalisation identique à l'ancienne page de connexion : espaces retirés, majuscules. */
export function normalizeIdc(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Listes d'IDC lues dans les variables d'environnement du serveur (séparées par des virgules).
 * Elles ne sont plus présentes dans le code envoyé aux navigateurs.
 */
function idcList(name: string): Set<string> {
  return new Set(
    (process.env[name] || '')
      .split(',')
      .map((v) => normalizeIdc(v))
      .filter(Boolean)
  );
}

/**
 * Retrouve l'agent correspondant à un IDC, avec la même règle qu'avant :
 * identifiant complet du document, ses 6 premiers caractères, ou le matricule.
 */
async function findAgentByIdc(idc: string): Promise<string | null> {
  // select() ne rapatrie que le matricule : pas de photos ni de données personnelles.
  const snap = await adminDb().collection('agents').select('registrationNumber').get();
  for (const docSnap of snap.docs) {
    const aId = docSnap.id.trim().toUpperCase();
    const reg = String(docSnap.get('registrationNumber') ?? '').trim().toUpperCase();
    if (aId === idc || (aId.length >= 6 && aId.substring(0, 6) === idc) || (reg && reg === idc)) {
      return docSnap.id;
    }
  }
  return null;
}

/** Détermine le rôle d'un IDC, ou null s'il n'est pas reconnu. */
export async function resolveIdc(rawIdc: string): Promise<IdcIdentity | null> {
  const idc = normalizeIdc(rawIdc);
  if (idc.length < 3 || idc.length > 64) return null;

  if (idcList('ADMIN_IDCS').has(idc)) {
    return { role: 'admin', idc, agentId: null, restricted: false };
  }
  if (idcList('RESTRICTED_ADMIN_IDCS').has(idc)) {
    return { role: 'admin', idc, agentId: null, restricted: true };
  }
  if (idcList('SECRETARIAT_IDCS').has(idc)) {
    return { role: 'secretariat', idc, agentId: null, restricted: false };
  }

  const agentId = await findAgentByIdc(idc);
  if (agentId) {
    return { role: 'observer', idc, agentId, restricted: false };
  }
  return null;
}

// --- Limitation des tentatives (anti force brute) ---------------------------

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 10; // échecs autorisés par adresse IP et par fenêtre

function rateLimitRef(ip: string) {
  // L'adresse IP n'est pas stockée en clair.
  const key = createHash('sha256').update(`sbssi-login:${ip}`).digest('hex');
  return adminDb().collection('_login_rate_limits').doc(key);
}

/** true si cette adresse a dépassé le nombre d'échecs autorisés. */
export async function isRateLimited(ip: string): Promise<boolean> {
  const snap = await rateLimitRef(ip).get();
  if (!snap.exists) return false;
  const { failures = 0, windowStart = 0 } = snap.data() as { failures?: number; windowStart?: number };
  if (Date.now() - windowStart > WINDOW_MS) return false;
  return failures >= MAX_FAILURES;
}

export async function recordFailure(ip: string): Promise<void> {
  const ref = rateLimitRef(ip);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.exists ? (snap.data() as { failures?: number; windowStart?: number }) : null;
    if (!data || now - (data.windowStart ?? 0) > WINDOW_MS) {
      tx.set(ref, { failures: 1, windowStart: now, updatedAt: FieldValue.serverTimestamp() });
    } else {
      tx.update(ref, { failures: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    }
  });
}

export async function clearFailures(ip: string): Promise<void> {
  await rateLimitRef(ip).delete().catch(() => {});
}

// --- Identifiants des agents (mot de passe) ----------------------------------
//
// Collection « _agent_credentials » : réservée au serveur. Les règles Firestore
// refusent tout accès navigateur aux collections dont le nom commence par « _ »,
// y compris aux administrateurs.

function credentialRef(agentId: string) {
  return adminDb().collection('_agent_credentials').doc(agentId);
}

/** Empreinte du mot de passe de l'agent, ou null s'il n'en a pas encore créé. */
export async function getAgentPasswordHash(agentId: string): Promise<string | null> {
  const snap = await credentialRef(agentId).get();
  const hash = snap.exists ? snap.get('passwordHash') : null;
  return typeof hash === 'string' && hash ? hash : null;
}

/**
 * Enregistre le premier mot de passe de l'agent.
 * Renvoie false si un mot de passe existe déjà (création concurrente ou rejouée).
 */
export async function createAgentPassword(agentId: string, passwordHash: string): Promise<boolean> {
  try {
    await credentialRef(agentId).create({
      passwordHash,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (err) {
    // ALREADY_EXISTS (code gRPC 6)
    if ((err as { code?: number }).code === 6) return false;
    throw err;
  }
}

/** Supprime le mot de passe : l'agent en créera un nouveau à sa prochaine connexion. */
export async function resetAgentPassword(agentId: string): Promise<void> {
  await credentialRef(agentId).delete();
}
