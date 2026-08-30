import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { loadEnvironment, type Environment } from '../src/config/env.js';
import { isValidObjectId } from '../src/lib/object-id.js';
import { parsePagination } from '../src/lib/pagination.js';
import { parseSort } from '../src/lib/sorting.js';
import { assertSafeTestDatabase } from '../src/lib/test-database.js';
import { createLogger } from '../src/lib/logger.js';
import { validate } from '../src/validation/validate.js';
import { publicRateLimit } from '../src/middleware/security.js';

const environment: Environment = {
  NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 3000,
  MONGODB_URI: 'mongodb://localhost:27017/job_board_test', WEB_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'silent', REQUEST_BODY_LIMIT: 102_400,
  ACCESS_TOKEN_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters', ACCESS_TOKEN_ISSUER: 'job-board-api',
  ACCESS_TOKEN_AUDIENCE: 'job-board-web', ACCESS_TOKEN_TTL_SECONDS: 600, REFRESH_TOKEN_TTL_DAYS: 7,
};

describe('validation foundation', () => {
  it('returns controlled validation errors without a product route', async () => {
    const app = createApp({
      environment, logger: createLogger(environment), isDatabaseReady: () => true,
      configureRoutes: (instance) => instance.get('/test/validated', validate('query', z.object({ page: z.coerce.number().int().min(1) })), (_request, response) => response.sendStatus(204)),
    });
    const response = await request(app).get('/test/validated?page=0').expect(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Request validation failed' });
    expect(response.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'page' })]));
  });
});

describe('query safety primitives', () => {
  it('parses bounded pagination values', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20 });
    expect(parsePagination({ page: '2', limit: '50' })).toEqual({ page: 2, limit: 50 });
    expect(() => parsePagination({ page: 0 })).toThrow();
    expect(() => parsePagination({ limit: 101 })).toThrow();
  });

  it('allows only caller-owned sort fields', () => {
    expect(parseSort('-createdAt', ['createdAt'])).toEqual({ field: 'createdAt', direction: -1 });
    expect(() => parseSort('malicious', ['createdAt'])).toThrow('Sort field is not supported');
  });

  it('requires strict hexadecimal MongoDB ObjectIds', () => {
    expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
    expect(isValidObjectId('not-an-object-id')).toBe(false);
  });
});

describe('configuration and test database safety', () => {
  it('fails safely for invalid configuration without including values', () => {
    expect(() => loadEnvironment({ ...process.env, MONGODB_URI: 'not-a-uri', WEB_ORIGIN: 'http://localhost:5173' })).toThrow('MONGODB_URI');
    expect(() => loadEnvironment({ ...process.env, MONGODB_URI: 'not-a-uri', WEB_ORIGIN: 'http://localhost:5173' })).not.toThrow('not-a-uri');
  });

  it('rejects missing authentication secrets without exposing their value', () => {
    const source = {
      NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: '3000', MONGODB_URI: 'mongodb://localhost:27017/job_board_test',
      WEB_ORIGIN: 'http://localhost:5173', LOG_LEVEL: 'silent', REQUEST_BODY_LIMIT: '102400',
      ACCESS_TOKEN_SECRET: '', ACCESS_TOKEN_ISSUER: 'job-board-api', ACCESS_TOKEN_AUDIENCE: 'job-board-web',
      ACCESS_TOKEN_TTL_SECONDS: '600', REFRESH_TOKEN_TTL_DAYS: '7',
    };
    expect(() => loadEnvironment(source)).toThrow('ACCESS_TOKEN_SECRET');
    expect(() => loadEnvironment({ ...source, ACCESS_TOKEN_SECRET: 'secret-value-not-for-errors' })).not.toThrow('secret-value-not-for-errors');
  });

  it('permits cleanup only for explicitly named test databases', () => {
    expect(() => assertSafeTestDatabase('test', 'mongodb://localhost:27017/job_board_test')).not.toThrow();
    expect(() => assertSafeTestDatabase('development', 'mongodb://localhost:27017/job_board_test')).toThrow();
    expect(() => assertSafeTestDatabase('test', 'mongodb://localhost:27017/job_board')).toThrow();
  });
});

describe('production security middleware', () => {
  it('does not trust forged forwarded addresses unless configured for a trusted proxy', async () => {
    const app = createApp({
      environment, logger: createLogger(environment), isDatabaseReady: () => true,
      configureRoutes: (instance) => instance.get('/test/limited', publicRateLimit(2, 60_000), (_request, response) => response.sendStatus(204)),
    });
    await request(app).get('/test/limited').set('x-forwarded-for', '198.51.100.1').expect(204);
    await request(app).get('/test/limited').set('x-forwarded-for', '198.51.100.2').expect(204);
    const limited = await request(app).get('/test/limited').set('x-forwarded-for', '198.51.100.3').expect(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');
    await request(app).get('/api/v1/health/live').expect(200);
  });

  it('marks authentication responses private and disables HSTS outside production', async () => {
    const app = createApp({ environment, logger: createLogger(environment), isDatabaseReady: () => true });
    const response = await request(app).get('/api/v1/auth/not-a-route').expect(404);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
