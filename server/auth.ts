import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Only token hashes are persisted, so a leaked db.json cannot be used to log in. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/** Counts failed logins per key and blocks after too many within the window. */
export class LoginThrottle {
  private failures = new Map<string, { count: number; first: number }>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 15 * 60 * 1000
  ) {}

  isBlocked(key: string): boolean {
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (Date.now() - entry.first > this.windowMs) {
      this.failures.delete(key);
      return false;
    }
    return entry.count >= this.maxFailures;
  }

  fail(key: string) {
    const entry = this.failures.get(key);
    if (!entry || Date.now() - entry.first > this.windowMs) {
      this.failures.set(key, { count: 1, first: Date.now() });
    } else {
      entry.count += 1;
    }
  }

  reset(key: string) {
    this.failures.delete(key);
  }
}
