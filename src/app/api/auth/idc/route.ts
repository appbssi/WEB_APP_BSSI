import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { adminAuth, isAdminConfigured } from '@/lib/server/firebase-admin';
import {
  clearFailures,
  createAgentPassword,
  getAgentPasswordHash,
  isRateLimited,
  recordFailure,
  resolveIdc,
  type IdcIdentity,
} from '@/lib/server/idc-auth';
import { hashPassword, passwordProblem, PASSWORD_MAX_LENGTH, verifyPassword } from '@/lib/server/agent-password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  idc: z.string().min(1).max(64),
  /** Mot de passe d'un agent qui en a déjà un */
  password: z.string().max(PASSWORD_MAX_LENGTH).optional(),
  /** Premier mot de passe choisi par l'agent */
  newPassword: z.string().max(PASSWORD_MAX_LENGTH).optional(),
});

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

async function issueToken(identity: IdcIdentity) {
  // Un compte Firebase stable par IDC ; le rôle est porté par le jeton signé.
  const uid = `idc_${identity.idc.replace(/[^A-Z0-9_-]/g, '_')}`;
  const token = await adminAuth().createCustomToken(uid, {
    role: identity.role,
    idc: identity.idc,
    agentId: identity.agentId,
    restricted: identity.restricted,
  });
  return NextResponse.json({ token });
}

const TOO_MANY = () =>
  NextResponse.json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, { status: 429 });

/**
 * Connexion.
 * - Administrateurs et secrétariat : IDC seul (inchangé).
 * - Agents : IDC puis mot de passe. À la première connexion, l'agent crée son mot de passe.
 *
 * Réponses sans jeton : { step: 'password' } (saisir le mot de passe)
 * ou { step: 'create_password' } (première connexion : en choisir un).
 */
export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) {
    console.error('[auth/idc] FIREBASE_SERVICE_ACCOUNT non configuré');
    return NextResponse.json({ error: 'Service de connexion indisponible.' }, { status: 503 });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    parsed = null;
  }
  if (!parsed?.success) {
    return NextResponse.json({ error: 'Identifiant (IDC) incorrect.' }, { status: 400 });
  }

  const ip = clientIp(req);
  const { password, newPassword } = parsed.data;

  try {
    if (await isRateLimited(ip)) return TOO_MANY();

    const identity = await resolveIdc(parsed.data.idc);
    if (!identity) {
      await recordFailure(ip);
      return NextResponse.json({ error: 'Identifiant (IDC) incorrect.' }, { status: 401 });
    }

    // Administrateurs et secrétariat : pas de mot de passe
    if (identity.role !== 'observer' || !identity.agentId) {
      await clearFailures(ip);
      return issueToken(identity);
    }

    // Agents : limitation propre à chaque compte, en plus de celle par adresse IP
    const agentKey = `agent:${identity.agentId}`;
    if (await isRateLimited(agentKey)) return TOO_MANY();

    const storedHash = await getAgentPasswordHash(identity.agentId);

    // Première connexion : l'agent crée son mot de passe
    if (!storedHash) {
      if (!newPassword) return NextResponse.json({ step: 'create_password' });
      const problem = passwordProblem(newPassword);
      if (problem) return NextResponse.json({ step: 'create_password', error: problem }, { status: 400 });

      const created = await createAgentPassword(identity.agentId, await hashPassword(newPassword));
      if (!created) {
        // Un mot de passe vient d'être créé entre-temps : il faut le saisir
        return NextResponse.json(
          { step: 'password', error: 'Un mot de passe existe déjà pour cet IDC. Saisissez-le.' },
          { status: 409 }
        );
      }
      await clearFailures(ip);
      return issueToken(identity);
    }

    // Connexions suivantes : IDC + mot de passe
    if (!password) return NextResponse.json({ step: 'password' });

    if (!(await verifyPassword(password, storedHash))) {
      await Promise.all([recordFailure(ip), recordFailure(agentKey)]);
      return NextResponse.json({ step: 'password', error: 'Mot de passe incorrect.' }, { status: 401 });
    }

    await Promise.all([clearFailures(ip), clearFailures(agentKey)]);
    return issueToken(identity);
  } catch (err) {
    console.error('[auth/idc] Erreur de connexion', err);
    return NextResponse.json({ error: 'Service de connexion indisponible.' }, { status: 503 });
  }
}
