import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fausse collection « agents » : aucun accès à la vraie base pendant les tests
const fakeAgents = [
  { id: 'Ab12CdEfGh', registrationNumber: 'MAT-001' },
  { id: 'Zz99YyXxWw', registrationNumber: '' },
];

vi.mock('./firebase-admin', () => ({
  adminDb: () => ({
    collection: () => ({
      select: () => ({
        get: async () => ({
          docs: fakeAgents.map((a) => ({
            id: a.id,
            get: (field: string) => (field === 'registrationNumber' ? a.registrationNumber : undefined),
          })),
        }),
      }),
    }),
  }),
}));

const { resolveIdc, normalizeIdc } = await import('./idc-auth');

describe('connexion par IDC', () => {
  beforeEach(() => {
    process.env.ADMIN_IDCS = 'ADM001, adm002';
    process.env.RESTRICTED_ADMIN_IDCS = 'LIM001';
    process.env.SECRETARIAT_IDCS = 'SEC001';
  });
  afterEach(() => {
    delete process.env.ADMIN_IDCS;
    delete process.env.RESTRICTED_ADMIN_IDCS;
    delete process.env.SECRETARIAT_IDCS;
  });

  it('normalise les espaces et la casse', () => {
    expect(normalizeIdc('  adm001 ')).toBe('ADM001');
  });

  it('reconnaît les administrateurs (insensible à la casse)', async () => {
    expect(await resolveIdc('adm002')).toMatchObject({ role: 'admin', restricted: false, agentId: null });
  });

  it('reconnaît les administrateurs à accès limité', async () => {
    expect(await resolveIdc('LIM001')).toMatchObject({ role: 'admin', restricted: true });
  });

  it('reconnaît le secrétariat', async () => {
    expect(await resolveIdc('SEC001')).toMatchObject({ role: 'secretariat' });
  });

  it('reconnaît un agent par les 6 premiers caractères de son identifiant', async () => {
    expect(await resolveIdc('ab12cd')).toMatchObject({ role: 'observer', agentId: 'Ab12CdEfGh' });
  });

  it('reconnaît un agent par son matricule', async () => {
    expect(await resolveIdc('mat-001')).toMatchObject({ role: 'observer', agentId: 'Ab12CdEfGh' });
  });

  it('refuse un IDC inconnu, trop court ou trop long', async () => {
    expect(await resolveIdc('INCONNU')).toBeNull();
    expect(await resolveIdc('ab')).toBeNull();
    expect(await resolveIdc('x'.repeat(65))).toBeNull();
  });

  it("un matricule vide n'ouvre pas de session", async () => {
    expect(await resolveIdc('   ')).toBeNull();
  });
});
