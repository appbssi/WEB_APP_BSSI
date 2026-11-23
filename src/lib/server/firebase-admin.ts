import 'server-only';
import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * SDK Admin Firebase, utilisé UNIQUEMENT côté serveur (routes API).
 *
 * Il lit la clé du compte de service dans la variable d'environnement
 * FIREBASE_SERVICE_ACCOUNT (le JSON complet, ou ce JSON encodé en base64).
 * Cette clé ne doit jamais être commitée ni exposée au navigateur.
 */
let adminApp: App | null = null;

function loadServiceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const parsed = JSON.parse(json);
  // Les sauts de ligne de la clé privée sont souvent échappés dans les variables d'environnement
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

export function isAdminConfigured(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
}

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length) {
    adminApp = getApp();
    return adminApp;
  }
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT manquant : le service de connexion ne peut pas démarrer.');
  }
  adminApp = initializeApp({ credential: cert(serviceAccount as any) });
  return adminApp;
}

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());
