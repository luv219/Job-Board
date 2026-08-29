import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import type { Environment } from '../src/config/env.js';

const environment: Environment = {
  NODE_ENV: 'test',
  API_PORT: 3000,
  MONGODB_URI: 'mongodb://localhost:27017/job_board_test',
  WEB_ORIGIN: 'http://localhost:5173',
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
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns a controlled response when not ready', async () => {
    const response = await request(appWhen(false)).get('/api/v1/health/ready').expect(503);
    expect(response.body).toEqual({ status: 'not_ready' });
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
});
