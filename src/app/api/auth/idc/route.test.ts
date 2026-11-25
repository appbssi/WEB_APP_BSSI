import { beforeEach, describe, expect, it, vi } from 'vitest';

// Base et Firebase Auth simulées : aucun accès au vrai projet pendant les tests
const credentials = new Map<string, string>();
const failures = new Map<string, number>();

vi.mock('@/lib/server/firebase-admin', () => ({
  isAdminConfigured: () => true,
  adminAuth: () => ({ createCustomToken: async (uid: string) => `token-for-${uid}` }),
}));

vi.mock('@/lib/server/idc-auth', () => ({
  resolveIdc: async (raw: string) => {
    const idc = raw.trim().toUpperCase();
    if (idc === 'ADM001') return { role: 'admin', idc, agentId: null, restricted: false };
    if (idc === 'MAT-001') return { role: 'observer', idc, agentId: 'agent-1', restricted: false };
    return null;
  },
  isRateLimited: async (key: string) => (failures.get(key) ?? 0) >= 10,
  recordFailure: async (key: string) => void failures.set(key, (failures.get(key) ?? 0) + 1),
  clearFailures: async (key: string) => void failures.delete(key),
  getAgentPasswordHash: async (id: string) => credentials.get(id) ?? null,
  createAgentPassword: async (id: string, hash: string) => {
    if (credentials.has(id)) return false;
    credentials.set(id, hash);
    return true;
  },
}));

const { POST } = await import('./route');

async function login(body: Record<string, unknown>) {
  const req = new Request('http://localhost/api/auth/idc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req as unknown as Parameters<typeof POST>[0]);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('connexion IDC + mot de passe', () => {
  beforeEach(() => {
    credentials.clear();
    failures.clear();
  });

  it("l'administrateur se connecte toujours avec son seul IDC", async () => {
    const r = await login({ idc: 'adm001' });
    expect(r.body.token).toBe('token-for-idc_ADM001');
  });

  it('un IDC inconnu est refusé', async () => {
    expect((await login({ idc: 'INCONNU' })).status).toBe(401);
  });

  it("à la première connexion, l'agent doit créer un mot de passe", async () => {
    const r = await login({ idc: 'MAT-001' });
    expect(r.body).toEqual({ step: 'create_password' });
    expect(r.body.token).toBeUndefined();
  });

  it('un mot de passe trop faible est refusé à la création', async () => {
    const r = await login({ idc: 'MAT-001', newPassword: 'court' });
    expect(r.status).toBe(400);
    expect(r.body.step).toBe('create_password');
    expect(credentials.size).toBe(0);
  });

  it('création puis connexions suivantes avec IDC + mot de passe', async () => {
    const created = await login({ idc: 'MAT-001', newPassword: 'Secret123' });
    expect(created.body.token).toBeTruthy();

    // Ensuite, l'IDC seul ne suffit plus
    expect((await login({ idc: 'MAT-001' })).body).toEqual({ step: 'password' });

    const wrong = await login({ idc: 'MAT-001', password: 'Mauvais99' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.token).toBeUndefined();

    const ok = await login({ idc: 'MAT-001', password: 'Secret123' });
    expect(ok.body.token).toBeTruthy();
  });

  it('on ne peut pas recréer un mot de passe déjà existant', async () => {
    await login({ idc: 'MAT-001', newPassword: 'Secret123' });
    const again = await login({ idc: 'MAT-001', newPassword: 'Pirate999' });
    expect(again.body.token).toBeUndefined();
    expect(again.body.step).toBe('password');
    expect((await login({ idc: 'MAT-001', password: 'Pirate999' })).status).toBe(401);
  });

  it('bloque le compte après 10 mauvais mots de passe', async () => {
    await login({ idc: 'MAT-001', newPassword: 'Secret123' });
    for (let i = 0; i < 10; i++) await login({ idc: 'MAT-001', password: `Faux${i}xxxx` });
    expect((await login({ idc: 'MAT-001', password: 'Secret123' })).status).toBe(429);
  });
});
