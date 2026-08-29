import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Environment } from '../config/env.js';
import { AppError } from '../lib/app-error.js';

const algorithm = 'HS256';

function signingKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function createRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export async function createAccessToken(userId: string, role: string, environment: Environment): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: algorithm, typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(environment.ACCESS_TOKEN_ISSUER)
    .setAudience(environment.ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${environment.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(signingKey(environment.ACCESS_TOKEN_SECRET));
}

export async function verifyAccessToken(token: string, environment: Environment): Promise<{ userId: string; role: string }> {
  try {
    const { payload } = await jwtVerify(token, signingKey(environment.ACCESS_TOKEN_SECRET), {
      algorithms: [algorithm], issuer: environment.ACCESS_TOKEN_ISSUER, audience: environment.ACCESS_TOKEN_AUDIENCE,
    });
    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') throw new Error('Invalid claims');
    return { userId: payload.sub, role: payload.role };
  } catch {
    throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required' });
  }
}
