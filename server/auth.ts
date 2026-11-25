import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DataStore } from './storeTypes.ts';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
export const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export interface AuthTokenPayload {
  email: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  adminEmail?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, originalHex] = parts;
  if (!salt || !originalHex) {
    return false;
  }
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, original);
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function base64UrlDecode(input: string): string {
  const padded = input.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signToken(email: string): string {
  const now = Date.now();
  const payload: AuthTokenPayload = {
    email,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest();
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

export function verifyToken(token: string): AuthTokenPayload | null {
  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0) {
    return null;
  }
  const encodedPayload = token.slice(0, dotIndex);
  const encodedSig = token.slice(dotIndex + 1);
  if (!encodedPayload || !encodedSig) {
    return null;
  }

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest();
  const expectedEncodedSig = base64UrlEncode(expectedSig);

  const a = Buffer.from(encodedSig, 'utf8');
  const b = Buffer.from(expectedEncodedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as AuthTokenPayload;
    if (!parsed.email || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function verifyAdminToken(token: string, store?: DataStore): Promise<string | null> {
  const payload = verifyToken(token);
  if (payload) {
    return payload.email;
  }
  if (store) {
    const stored = await store.getSessionByTokenHash(hashSessionToken(token));
    if (stored && stored.expires_at > Date.now()) {
      return stored.email;
    }
  }
  return null;
}

export function createRequireAdmin(store?: DataStore) {
  return async function requireAdmin(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
      }
      const token = header.slice('Bearer '.length).trim();
      const email = await verifyAdminToken(token, store);
      if (!email) {
        res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
        return;
      }
      req.adminEmail = email;
      next();
    } catch (err) {
      next(err);
    }
  };
}
