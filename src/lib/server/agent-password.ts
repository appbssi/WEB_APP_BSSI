import 'server-only';
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'crypto';

/**
 * Mots de passe des agents.
 *
 * Seule une empreinte scrypt (sel aléatoire, coût élevé) est conservée, jamais le mot de passe.
 * Format stocké : scrypt$N$r$p$<sel base64>$<empreinte base64>
 */
const KEY_LENGTH = 64;
const PARAMS = { N: 16384, r: 8, p: 1 } as const;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { ...options, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

/** Règles d'un mot de passe : renvoie le message d'erreur, ou null s'il est acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`;
  }
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/[0-9]/.test(password)) {
    return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Comparaison en temps constant ; une empreinte mal formée ne correspond jamais. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  if (expected.length !== KEY_LENGTH) return false;
  try {
    const key = await scrypt(password, Buffer.from(saltB64, 'base64'), KEY_LENGTH, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
