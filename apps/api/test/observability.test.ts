import pino from 'pino';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { Environment } from '../src/config/env.js';
import { applicationRevision, loadEnvironment } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
import { createOperationalMetrics } from '../src/lib/metrics.js';
import { normalizedRoute } from '../src/middleware/observability.js';
import type { Request } from 'express';

const environment: Environment = {
  NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 3000,
  MONGODB_URI: 'mongodb://localhost:27017/job_board_test', WEB_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'silent', REQUEST_BODY_LIMIT: 102_400,
  ACCESS_TOKEN_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters', ACCESS_TOKEN_ISSUER: 'job-board-api',
  ACCESS_TOKEN_AUDIENCE: 'job-board-web', ACCESS_TOKEN_TTL_SECONDS: 600, REFRESH_TOKEN_TTL_DAYS: 7,
};

function makeMetrics() {
  return createOperationalMetrics({ collectProcessMetrics: false, applicationVersion: '0.1.0-test', environment: 'test', revision: 'test-revision', searchMode: 'basic' });
}

describe('operational metrics', () => {
  it('exposes Prometheus text with normalized HTTP route labels and no raw request values', async () => {
    const metrics = makeMetrics();
    const app = createApp({ environment, logger: createLogger(environment), isDatabaseReady: () => true, metrics });
    await request(app).get('/api/v1/health/live?token=private-token').set('x-request-id', 'request_123').expect(200);
    await request(app).get('/untrusted/attacker-controlled-value').expect(404);
    const output = await metrics.registry.metrics();
    expect(output).toContain('job_board_http_requests_total{method="GET",route="/api/v1/health/live",status_class="2xx"} 1');
    expect(output).toContain('job_board_http_requests_total{method="GET",route="unmatched",status_class="4xx"} 1');
    expect(output).toContain('job_board_http_request_duration_seconds_bucket');
    expect(output).not.toContain('private-token');
    expect(output).not.toContain('attacker-controlled-value');
    expect(output).not.toContain('request_123');

    const response = await request(app).get('/metrics').expect(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('job_board_build_info');
  });

  it('keeps dynamic route values out of route labels', () => {
    const requestWithRoute = {
      originalUrl: '/api/v1/jobs/senior-platform-engineer',
      path: '/api/v1/jobs/senior-platform-engineer',
      route: { path: '/jobs/:slug' },
    } as Request;
    expect(normalizedRoute(requestWithRoute)).toBe('/api/v1/jobs/:slug');
  });

  it('records representative provider failures with bounded labels', async () => {
    const metrics = makeMetrics();
    metrics.recordEmail('PASSWORD_RESET', 'failure');
    metrics.recordResume('upload', 'failure');
    metrics.recordSearch('basic', 'search', true, 'failure');
    const output = await metrics.registry.metrics();
    expect(output).toContain('job_board_email_operations_total{message_type="PASSWORD_RESET",result="failure"} 1');
    expect(output).toContain('job_board_resume_operations_total{operation="upload",result="failure"} 1');
    expect(output).toContain('job_board_search_requests_total{mode="basic",operation="search",has_query="true",result="failure"} 1');
  });

  it('enables default Node process metrics in a runtime registry', async () => {
    const metrics = createOperationalMetrics({ collectProcessMetrics: true, applicationVersion: '0.1.0-test', environment: 'test', revision: 'test-revision', searchMode: 'basic' });
    expect(await metrics.registry.metrics()).toContain('job_board_process_start_time_seconds');
  });
});

describe('structured logging and metadata', () => {
  it('correlates completion logs and redacts sensitive values', async () => {
    const lines: Record<string, unknown>[] = [];
    const destination = { write: (line: string) => { lines.push(JSON.parse(line) as Record<string, unknown>); return true; } } as pino.DestinationStream;
    const logger = createLogger({ NODE_ENV: 'development', LOG_LEVEL: 'info' }, destination);
    const metrics = makeMetrics();
    const app = createApp({ environment, logger, isDatabaseReady: () => true, metrics });
    await request(app).get('/api/v1/health/live').set('x-request-id', 'request_123').expect(200);
    logger.info({ password: 'password-value', accessUrl: 'signed-url-value', token: 'token-value' }, 'redaction check');
    expect(lines).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'http_request_completed', requestId: 'request_123', route: '/api/v1/health/live' })]));
    expect(JSON.stringify(lines)).not.toContain('password-value');
    expect(JSON.stringify(lines)).not.toContain('signed-url-value');
    expect(JSON.stringify(lines)).not.toContain('token-value');
  });

  it('logs unexpected errors and slow completions with the request ID but no raw URL', async () => {
    const lines: Record<string, unknown>[] = [];
    const destination = { write: (line: string) => { lines.push(JSON.parse(line) as Record<string, unknown>); return true; } } as pino.DestinationStream;
    const logger = createLogger({ NODE_ENV: 'development', LOG_LEVEL: 'info' }, destination);
    const metrics = makeMetrics();
    const app = createApp({ environment: { ...environment, SLOW_REQUEST_THRESHOLD_MS: 0 }, logger, isDatabaseReady: () => true, metrics, configureRoutes: (instance) => instance.get('/test/unexpected', () => { throw new Error('private failure'); }) });
    await request(app).get('/test/unexpected?token=private-token').set('x-request-id', 'request_500').expect(500);
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'request_error', requestId: 'request_500', statusCode: 500, route: '/test/unexpected' }),
      expect.objectContaining({ event: 'slow_http_request', requestId: 'request_500', route: '/test/unexpected' }),
    ]));
    expect(JSON.stringify(lines)).not.toContain('private-token');
  });

  it('uses safe configured revision and unknown fallbacks without runtime Git access', () => {
    expect(applicationRevision({ APP_REVISION: 'deploy-abc' })).toBe('deploy-abc');
    expect(applicationRevision({})).toBe('unknown');
    const source = { ...process.env, NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: '3000', MONGODB_URI: 'mongodb://localhost:27017/job_board_test', WEB_ORIGIN: 'http://localhost:5173', ACCESS_TOKEN_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters' };
    expect(() => loadEnvironment({ ...source, LOG_LEVEL: 'invalid' })).toThrow('LOG_LEVEL');
  });
});
