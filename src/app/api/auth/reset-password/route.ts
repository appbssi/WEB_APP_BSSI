import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { adminAuth, isAdminConfigured } from '@/lib/server/firebase-admin';
import { resetAgentPassword } from '@/lib/server/idc-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ agentId: z.string().min(1).max(128) });

/**
 * Réinitialisation du mot de passe d'un agent, par un administrateur.
 * L'agent créera un nouveau mot de passe à sa prochaine connexion.
 */
export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Service indisponible.' }, { status: 503 });
  }

  const idToken = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!idToken) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Agent inconnu.' }, { status: 400 });

    await resetAgentPassword(parsed.data.agentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[auth/reset-password] Échec', err);
    return NextResponse.json({ error: 'Réinitialisation impossible.' }, { status: 500 });
  }
}
