import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { UserAccount } from '../src/types/clinic.ts';

export const DEFAULT_DEMO_STAFF_PASSWORD = 'thibbuncare2026';

export function hashPassword(password: string, existingSalt?: string): string {
  const salt = existingSalt || randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash?: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, hexHash] = storedHash.split(':');
  if (!salt || !hexHash) return false;
  try {
    const expected = Buffer.from(hexHash, 'hex');
    const actual = scryptSync(password, salt, 32);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function sanitizeUser(user: UserAccount): Omit<UserAccount, 'passwordHash'> {
  const { passwordHash: _omitted, ...safe } = user;
  return safe;
}

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    'thibbuncare-session-secret-2026'
  );
}

export function signStaffSessionToken(
  userId: string,
  ttlMs = 24 * 60 * 60 * 1000
): string {
  const payload = {
    uid: userId,
    iat: Date.now(),
    exp: Date.now() + ttlMs,
    jti: randomBytes(8).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyStaffSessionToken(
  token: string
): { userId: string; exp: number } | null {
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  try {
    const expectedSig = createHmac('sha256', getSessionSecret())
      .update(encoded)
      .digest('base64url');
    const actualBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      uid?: string;
      exp?: number;
    };
    if (!parsed.uid || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return { userId: parsed.uid, exp: parsed.exp };
  } catch {
    return null;
  }
}
