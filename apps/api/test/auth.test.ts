import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import type { Environment } from '../src/config/env.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { createAccessToken, createRefreshToken, hashRefreshToken, verifyAccessToken } from '../src/auth/tokens.js';
import { clearRefreshCookie, getRefreshCookie, setRefreshCookie } from '../src/auth/cookies.js';
import { User } from '../src/models/user.js';
import { AuthSession } from '../src/models/auth-session.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';

const environment: Environment = {
  NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 3000, MONGODB_URI: 'mongodb://localhost:27017/job_board_test',
  WEB_ORIGIN: 'http://localhost:5173', LOG_LEVEL: 'silent', REQUEST_BODY_LIMIT: 102_400,
  ACCESS_TOKEN_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters', ACCESS_TOKEN_ISSUER: 'job-board-api',
  ACCESS_TOKEN_AUDIENCE: 'job-board-web', ACCESS_TOKEN_TTL_SECONDS: 600, REFRESH_TOKEN_TTL_DAYS: 7,
};

function app() {
  return createApp({
    environment, logger: createLogger(environment), isDatabaseReady: () => true,
    configureRoutes: (instance) => {
      instance.get('/test/employer', requireAuth(environment), requireRole('EMPLOYER'), (_request, response) => response.sendStatus(204));
    },
  });
}

describe('authentication primitives', () => {
  it('uses Argon2id hashes and verifies passwords without retaining plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toContain('$argon2id$');
    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong password')).resolves.toBe(false);
  });

  it('issues signed short-lived tokens and rejects tampering', async () => {
    const token = await createAccessToken('507f1f77bcf86cd799439011', 'APPLICANT', environment);
    await expect(verifyAccessToken(token, environment)).resolves.toEqual({ userId: '507f1f77bcf86cd799439011', role: 'APPLICANT' });
    await expect(verifyAccessToken(`${token}x`, environment)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('creates opaque refresh tokens and stores only a deterministic digest', () => {
    const token = createRefreshToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(hashRefreshToken(token)).not.toBe(token);
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });
});

describe('authentication HTTP boundary', () => {
  it('rejects invalid registration roles before persistence', async () => {
    const response = await request(app()).post('/api/v1/auth/register').send({ email: 'user@example.com', password: 'long enough password', role: 'ADMIN' }).expect(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires a valid bearer access token for /auth/me', async () => {
    await request(app()).get('/api/v1/auth/me').expect(401);
    await request(app()).get('/api/v1/auth/me').set('authorization', 'Basic anything').expect(401);
  });

  it('uses the current stored role for authorization', async () => {
    const user = { _id: { toString: () => '507f1f77bcf86cd799439011' }, role: 'APPLICANT', accountStatus: 'ACTIVE' };
    const spy = vi.spyOn(User, 'findById').mockReturnValue({ lean: async () => user } as never);
    const token = await createAccessToken('507f1f77bcf86cd799439011', 'EMPLOYER', environment);
    const response = await request(app()).get('/test/employer').set('authorization', `Bearer ${token}`).expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    spy.mockRestore();
  });
});

describe('cookie and model safeguards', () => {
  it('sets and clears HttpOnly, same-site refresh cookies without JSON transport', () => {
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };
    setRefreshCookie(response as never, 'a'.repeat(64), environment);
    expect(response.cookie).toHaveBeenCalledWith('refresh_token', expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: false, path: '/api/v1/auth' }));
    clearRefreshCookie(response as never, environment);
    expect(response.clearCookie).toHaveBeenCalledWith('refresh_token', expect.objectContaining({ httpOnly: true, path: '/api/v1/auth' }));
    expect(getRefreshCookie({ refresh_token: 'a'.repeat(64) })).toHaveLength(64);
    expect(getRefreshCookie({ refresh_token: 'bad' })).toBeUndefined();
  });

  it('declares authentication-only database indexes', () => {
    expect(User.schema.indexes()).toEqual(expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ email: 1 })]) ]));
    expect(AuthSession.schema.indexes()).toEqual(expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ expiresAt: 1 })]) ]));
  });
});
