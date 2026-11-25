import { beforeEach, describe, expect, it, vi } from 'vitest';

// Données simulées : aucun accès au vrai projet pendant les tests
const agent = {
  agentId: 'agent-1',
  fullName: 'KONE Ibrahim',
  rank: 'Sergent',
  registrationNumber: 'MAT 123',
  contact: '07 01 02 03 45',
};
let pendingCode: { code: string; attempts: number; expiresAt: number } | null = null;
let savedHash: string | null = null;

vi.mock('@/lib/server/firebase-admin', () => ({
  isAdminConfigured: () => true,
  adminAuth: () => ({ createCustomToken: async (uid: string) => `token-for-${uid}` }),
}));

vi.mock('@/lib/server/idc-auth', () => ({
  resolveIdc: async (raw: string) => {
    const idc = raw.trim().toUpperCase();
    if (idc === 'AGENT1') return { role: 'observer', idc, agentId: 'agent-1', restricted: false };
    if (idc === 'ADM001') return { role: 'admin', idc, agentId: null, restricted: false };
    return null;
  },
  isRateLimited: async () => false,
  recordFailure: async () => {},
  clearFailures: async () => {},
}));

vi.mock('@/lib/server/password-reset', async () => {
  const real = await vi.importActual<typeof import('@/lib/server/password-reset')>(
    '@/lib/server/password-reset'
  );
  return {
    normalizeMatricule: real.normalizeMatricule,
    maskContact: real.maskContact,
    getAgentResetInfo: async (id: string) => (id === agent.agentId ? agent : null),
    createResetRequest: async () => {
      pendingCode = { code: '123456', attempts: 0, expiresAt: Date.now() + 3600_000 };
      return '123456';
    },
    checkResetCode: async (_id: string, code: string) => {
      if (!pendingCode) return 'none';
      if (Date.now() > pendingCode.expiresAt) return 'expired';
      if (code === pendingCode.code) return 'ok';
      pendingCode.attempts++;
      return pendingCode.attempts >= 5 ? 'locked' : 'invalid';
    },
    completeReset: async (_id: string, hash: string) => {
      savedHash = hash;
      pendingCode = null;
    },
  };
});

const { POST } = await import('./route');

async function call(body: Record<string, unknown>) {
  const req = new Request('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req as unknown as Parameters<typeof POST>[0]);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('mot de passe oublié', () => {
  beforeEach(() => {
    pendingCode = null;
    savedHash = null;
  });

  it('refuse si le matricule ne correspond pas à l’IDC', async () => {
    const r = await call({ idc: 'AGENT1', matricule: 'MAT 999' });
    expect(r.status).toBe(401);
    expect(pendingCode).toBeNull();
  });

  it('refuse un IDC inconnu ou administrateur, avec le même message', async () => {
    const a = await call({ idc: 'INCONNU', matricule: 'MAT 123' });
    const b = await call({ idc: 'ADM001', matricule: 'MAT 123' });
    expect(a.status).toBe(401);
    expect(b.body.error).toBe(a.body.error);
  });

  it('IDC + matricule corrects (espaces et casse ignorés) : code créé, contact masqué', async () => {
    const r = await call({ idc: 'agent1', matricule: 'mat123' });
    expect(r.body.sent).toBe(true);
    expect(r.body.contact).toBe('07 •• •• •• 45');
    expect(JSON.stringify(r.body)).not.toContain('123456');
    expect(pendingCode).not.toBeNull();
  });

  it('un mauvais code ne change rien ; le bon code change le mot de passe et connecte', async () => {
    await call({ idc: 'AGENT1', matricule: 'MAT 123' });
    const wrong = await call({ idc: 'AGENT1', code: '000000', newPassword: 'Nouveau123' });
    expect(wrong.status).toBe(401);
    expect(savedHash).toBeNull();

    const ok = await call({ idc: 'AGENT1', code: '123456', newPassword: 'Nouveau123' });
    expect(ok.body.token).toBe('token-for-idc_AGENT1');
    expect(savedHash).toMatch(/^scrypt\$/);

    // Le code ne sert qu'une fois
    const replay = await call({ idc: 'AGENT1', code: '123456', newPassword: 'Autre1234' });
    expect(replay.status).toBe(401);
  });

  it('refuse un nouveau mot de passe trop faible', async () => {
    await call({ idc: 'AGENT1', matricule: 'MAT 123' });
    const r = await call({ idc: 'AGENT1', code: '123456', newPassword: 'faible' });
    expect(r.status).toBe(400);
    expect(savedHash).toBeNull();
  });
});
