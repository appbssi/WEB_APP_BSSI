import { describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, verifyPassword } from './agent-password';

describe('mots de passe des agents', () => {
  it('ne stocke jamais le mot de passe en clair et le vérifie', async () => {
    const hash = await hashPassword('Secret123');
    expect(hash).not.toContain('Secret123');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('Secret123', hash)).toBe(true);
    expect(await verifyPassword('secret123', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('utilise un sel différent à chaque fois', async () => {
    expect(await hashPassword('Secret123')).not.toBe(await hashPassword('Secret123'));
  });

  it('refuse une empreinte mal formée', async () => {
    expect(await verifyPassword('Secret123', 'n-importe-quoi')).toBe(false);
    expect(await verifyPassword('Secret123', 'scrypt$1$2$3$abc$def')).toBe(false);
  });

  it('impose 8 caractères dont une lettre et un chiffre', () => {
    expect(passwordProblem('abc12')).toMatch(/8 caractères/);
    expect(passwordProblem('abcdefgh')).toMatch(/chiffre/);
    expect(passwordProblem('12345678')).toMatch(/lettre/);
    expect(passwordProblem('motdepasse1')).toBeNull();
  });
});
