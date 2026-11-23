import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { adminAuth, isAdminConfigured } from '@/lib/server/firebase-admin';
import { clearFailures, isRateLimited, recordFailure, resolveIdc } from '@/lib/server/idc-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ idc: z.string().min(1).max(64) });

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Connexion par IDC seul.
 * Le serveur vérifie l'IDC, détermine le rôle et renvoie un jeton Firebase signé
 * portant ce rôle. Le navigateur ne peut plus choisir son propre rôle.
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

  try {
    if (await isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
        { status: 429 }
      );
    }

    const identity = await resolveIdc(parsed.data.idc);
    if (!identity) {
      await recordFailure(ip);
      return NextResponse.json({ error: 'Identifiant (IDC) incorrect.' }, { status: 401 });
    }

    await clearFailures(ip);

    // Un compte Firebase stable par IDC ; le rôle est porté par le jeton signé.
    const uid = `idc_${identity.idc.replace(/[^A-Z0-9_-]/g, '_')}`;
    const token = await adminAuth().createCustomToken(uid, {
      role: identity.role,
      idc: identity.idc,
      agentId: identity.agentId,
      restricted: identity.restricted,
    });

    return NextResponse.json({ token });
  } catch (err) {
    console.error('[auth/idc] Erreur de connexion', err);
    return NextResponse.json({ error: 'Service de connexion indisponible.' }, { status: 503 });
  }
}
