import crypto from 'node:crypto';

export function createId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  const rand = crypto.randomBytes(6).toString('hex');
  return `${cleanPrefix}-${rand}`;
}

export function generateDeviceToken(): { rawToken: string; tokenHash: string; tokenPrefix: string } {
  const rawToken = `hq_dev_${crypto.randomBytes(24).toString('hex')}`;
  const tokenHash = hashDeviceToken(rawToken);
  const tokenPrefix = rawToken.slice(0, 12);
  return { rawToken, tokenHash, tokenPrefix };
}

export function hashDeviceToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function verifyDeviceToken(rawToken: string, expectedHash: string): boolean {
  if (!rawToken || !expectedHash) return false;
  const candidateHash = hashDeviceToken(rawToken);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function timingSafeStringEqual(aStr: string, bStr: string): boolean {
  if (!aStr || !bStr) return false;
  const a = Buffer.from(aStr, 'utf8');
  const b = Buffer.from(bStr, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || typeof password !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex || !/^[0-9a-f]{128}$/i.test(expectedHex)) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export const LOCAL_STAFF_TOKEN_PREFIX = 'hq_local_';
export const LOCAL_STAFF_TOKEN_ISSUER = 'hadiqtna-local-auth';

export interface LocalStaffTokenClaims {
  uid: string;
  email: string;
  name: string;
  email_verified: true;
  provider: 'LOCAL_STAFF';
  iss: typeof LOCAL_STAFF_TOKEN_ISSUER;
  iat: number; // Unix timestamp in seconds
  exp: number; // Unix timestamp in seconds
}

export type LocalTokenVerifyResult =
  | { ok: true; claims: LocalStaffTokenClaims }
  | { ok: false; reason: 'MALFORMED' | 'INVALID_SIGNATURE' | 'EXPIRED' | 'INVALID_TIMESTAMPS' };

export function signLocalStaffToken(
  claims: Omit<LocalStaffTokenClaims, 'iat' | 'exp' | 'email_verified' | 'provider' | 'iss'>,
  secret: string,
  ttlSeconds = 43200,
  issuedAtSeconds = Math.floor(Date.now() / 1000)
): string {
  if (!secret || secret.length < 16) {
    throw new Error('LOCAL_AUTH_SECRET must be at least 16 characters');
  }
  const iat = Math.floor(issuedAtSeconds);
  const ttl = Math.floor(ttlSeconds);
  if (!Number.isFinite(iat) || iat <= 0 || !Number.isFinite(ttl) || ttl <= 0) {
    throw new Error('Invalid token timestamp parameters');
  }

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload: LocalStaffTokenClaims = {
    uid: claims.uid,
    email: claims.email,
    name: claims.name,
    email_verified: true,
    provider: 'LOCAL_STAFF',
    iss: LOCAL_STAFF_TOKEN_ISSUER,
    iat,
    exp: iat + ttl,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${LOCAL_STAFF_TOKEN_PREFIX}${header}.${body}.${sig}`;
}

export function verifyLocalStaffTokenDetailed(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): LocalTokenVerifyResult {
  if (!token || !token.startsWith(LOCAL_STAFF_TOKEN_PREFIX) || !secret || secret.length < 16) {
    return { ok: false, reason: 'MALFORMED' };
  }
  const raw = token.slice(LOCAL_STAFF_TOKEN_PREFIX.length);
  const parts = raw.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) {
    return { ok: false, reason: 'MALFORMED' };
  }
  const [headerB64, bodyB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(`${headerB64}.${bodyB64}`).digest('base64url');
  if (!timingSafeStringEqual(sig, expectedSig)) {
    return { ok: false, reason: 'INVALID_SIGNATURE' };
  }

  try {
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg?: string;
      typ?: string;
    };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return { ok: false, reason: 'MALFORMED' };
    }

    const parsed = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as Partial<LocalStaffTokenClaims>;
    if (
      parsed.provider !== 'LOCAL_STAFF' ||
      parsed.iss !== LOCAL_STAFF_TOKEN_ISSUER ||
      parsed.email_verified !== true ||
      typeof parsed.uid !== 'string' ||
      !parsed.uid.trim() ||
      typeof parsed.email !== 'string' ||
      !parsed.email.trim() ||
      typeof parsed.name !== 'string'
    ) {
      return { ok: false, reason: 'MALFORMED' };
    }

    // Strict Unix seconds check (reject missing values or millisecond-scale numbers >= 1e12)
    if (
      typeof parsed.iat !== 'number' ||
      typeof parsed.exp !== 'number' ||
      !Number.isInteger(parsed.iat) ||
      !Number.isInteger(parsed.exp) ||
      parsed.iat <= 0 ||
      parsed.exp <= parsed.iat ||
      parsed.iat >= 1e12 ||
      parsed.exp >= 1e12
    ) {
      return { ok: false, reason: 'INVALID_TIMESTAMPS' };
    }

    // Allow max 60s forward clock skew on iat
    if (parsed.iat > nowSeconds + 60) {
      return { ok: false, reason: 'INVALID_TIMESTAMPS' };
    }

    if (parsed.exp <= nowSeconds) {
      return { ok: false, reason: 'EXPIRED' };
    }

    return { ok: true, claims: parsed as LocalStaffTokenClaims };
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
}

export function verifyLocalStaffToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): LocalStaffTokenClaims | null {
  const result = verifyLocalStaffTokenDetailed(token, secret, nowSeconds);
  return result.ok ? result.claims : null;
}

