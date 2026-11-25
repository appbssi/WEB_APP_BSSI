import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { adminAuth, isAdminConfigured } from '@/lib/server/firebase-admin';
import { clearFailures, isRateLimited, recordFailure, resolveIdc } from '@/lib/server/idc-auth';
import { hashPassword, passwordProblem, PASSWORD_MAX_LENGTH } from '@/lib/server/agent-password';
import {
  checkResetCode,
  completeReset,
  createResetRequest,
  getAgentResetInfo,
  maskContact,
  normalizeMatricule,
} from '@/lib/server/password-reset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  idc: z.string().min(1).max(64),
  /** Étape 1 : demande du code */
  matricule: z.string().max(64).optional(),
  /** Étape 2 : code reçu + nouveau mot de passe */
  code: z.string().max(12).optional(),
  newPassword: z.string().max(PASSWORD_MAX_LENGTH).optional(),
});

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

const MISMATCH = 'IDC ou matricule incorrect.';
const TOO_MANY = () =>
  NextResponse.json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, { status: 429 });

/**
 * Mot de passe oublié d'un agent.
 * - { idc, matricule } : si les deux correspondent, crée un code transmis par un administrateur.
 * - { idc, code, newPassword } : vérifie le code et enregistre le nouveau mot de passe, puis connecte l'agent.
 */
export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Service indisponible.' }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: MISMATCH }, { status: 400 });

  const ip = clientIp(req);
  const { idc, matricule, code, newPassword } = parsed.data;

  try {
    if (await isRateLimited(ip)) return TOO_MANY();

    const identity = await resolveIdc(idc);
    const agentId = identity?.role === 'observer' ? identity.agentId : null;

    // --- Étape 2 : code + nouveau mot de passe --------------------------------
    if (code !== undefined) {
      if (!agentId || !identity) {
        await recordFailure(ip);
        return NextResponse.json({ error: 'Code incorrect.' }, { status: 401 });
      }
      const problem = passwordProblem(newPassword ?? '');
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });

      const check = await checkResetCode(agentId, code);
      if (check !== 'ok') {
        await recordFailure(ip);
        const error =
          check === 'expired'
            ? 'Ce code a expiré. Refaites une demande.'
            : check === 'locked'
              ? 'Trop de codes erronés. Refaites une demande.'
              : check === 'none'
                ? 'Aucune demande en cours. Refaites une demande.'
                : 'Code incorrect.';
        return NextResponse.json({ error, restart: check !== 'invalid' }, { status: 401 });
      }

      await completeReset(agentId, await hashPassword(newPassword!));
      await clearFailures(ip);
      await clearFailures(`agent:${agentId}`);

      const uid = `idc_${identity.idc.replace(/[^A-Z0-9_-]/g, '_')}`;
      const token = await adminAuth().createCustomToken(uid, {
        role: identity.role,
        idc: identity.idc,
        agentId: identity.agentId,
        restricted: identity.restricted,
      });
      return NextResponse.json({ token });
    }

    // --- Étape 1 : IDC + matricule ---------------------------------------------
    const info = agentId ? await getAgentResetInfo(agentId) : null;
    const matches =
      !!info &&
      !!info.registrationNumber &&
      normalizeMatricule(info.registrationNumber) === normalizeMatricule(matricule ?? '');

    if (!matches || !info) {
      await recordFailure(ip);
      return NextResponse.json({ error: MISMATCH }, { status: 401 });
    }

    if (!info.contact.replace(/\D/g, '')) {
      return NextResponse.json(
        { error: "Aucun contact n'est enregistré sur votre fiche. Adressez-vous directement à un administrateur." },
        { status: 409 }
      );
    }

    await createResetRequest(info);
    await clearFailures(ip);
    return NextResponse.json({ sent: true, contact: maskContact(info.contact) });
  } catch (err) {
    console.error('[auth/forgot-password] Erreur', err);
    return NextResponse.json({ error: 'Service indisponible.' }, { status: 503 });
  }
}
