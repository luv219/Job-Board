import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import type { Environment } from '../src/config/env.js';

const environment: Environment = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
  MONGODB_URI: 'mongodb://localhost:27017/job_board_test',
  WEB_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
  REQUEST_BODY_LIMIT: 102_400,
  ACCESS_TOKEN_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters',
  ACCESS_TOKEN_ISSUER: 'job-board-api',
  ACCESS_TOKEN_AUDIENCE: 'job-board-web',
  ACCESS_TOKEN_TTL_SECONDS: 600,
  REFRESH_TOKEN_TTL_DAYS: 7,
};

function appWhen(databaseReady: boolean) {
  return createApp({ environment, logger: createLogger(environment), isDatabaseReady: () => databaseReady });
}

describe('health endpoints', () => {
  it('reports liveness without a database dependency', async () => {
    const response = await request(appWhen(false)).get('/api/v1/health/live').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('reports readiness when MongoDB is available', async () => {
    const response = await request(appWhen(true)).get('/api/v1/health/ready').expect(200);
    expect(response.body).toEqual({ status: 'ready', dependencies: { mongodb: 'available' } });
  });

  it('returns a controlled response when not ready', async () => {
    const response = await request(appWhen(false)).get('/api/v1/health/ready').expect(503);
    expect(response.body).toEqual({ status: 'not_ready', dependencies: { mongodb: 'unavailable' } });
  });
});

describe('API error handling', () => {
  it('returns a controlled 404 response for unknown routes', async () => {
    const response = await request(appWhen(true)).get('/unknown').expect(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Route not found' });
    expect(response.body.error.requestId).toEqual(expect.any(String));
  });

  it('returns the safe error shape for malformed JSON', async () => {
    const response = await request(appWhen(true))
      .post('/api/v1/health/live')
      .set('content-type', 'application/json')
      .send('{')
      .expect(400);
    expect(response.body.error).toMatchObject({ code: 'BAD_REQUEST' });
    expect(response.body.error.requestId).toEqual(expect.any(String));
  });

  it('preserves a safe request ID and replaces malformed IDs', async () => {
    const safe = await request(appWhen(true)).get('/api/v1/health/live').set('x-request-id', 'request_123').expect(200);
    expect(safe.headers['x-request-id']).toBe('request_123');

    const malformed = await request(appWhen(true)).get('/api/v1/health/live').set('x-request-id', 'x'.repeat(129)).expect(200);
    expect(malformed.headers['x-request-id']).not.toBe('x'.repeat(129));
    expect(malformed.headers['x-request-id']).toMatch(/^[a-f\d-]{36}$/i);
  });

  it('turns unexpected errors into a safe 500 response', async () => {
    const app = createApp({
      environment,
      logger: createLogger(environment),
      isDatabaseReady: () => true,
      configureRoutes: (instance) => instance.get('/test/unexpected', () => { throw new Error('private failure detail'); }),
    });
    const response = await request(app).get('/test/unexpected').expect(500);
    expect(response.body.error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    expect(response.body.error.requestId).toEqual(expect.any(String));
  });
});
