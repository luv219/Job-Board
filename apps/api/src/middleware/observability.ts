import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import type { OperationalMetrics } from '../lib/metrics.js';

const allowedMounts = new Set(['', '/api/v1', '/api/v1/auth', '/api/v1/health']);

export function normalizedRoute(request: Request): string {
  if (typeof request.route?.path !== 'string') return 'unmatched';
  const routeSegments = request.route.path.split('/').filter(Boolean);
  const originalPath = (request.originalUrl ?? request.path).split('?')[0] ?? '/';
  const pathSegments = originalPath.split('/').filter(Boolean);
  const mount = `/${pathSegments.slice(0, Math.max(0, pathSegments.length - routeSegments.length)).join('/')}`.replace(/\/$/, '');
  if (!allowedMounts.has(mount)) return 'unmatched';
  const route = `${mount}${request.route.path}` || '/';
  return route.startsWith('/') ? route : 'unmatched';
}

export function requestObservability(metrics: OperationalMetrics, logger: Logger, slowRequestThresholdMs: number) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();
    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const route = normalizedRoute(request);
      const fields = {
        event: 'http_request_completed', requestId: request.id, method: request.method, route,
        statusCode: response.statusCode, durationMs: Number(durationMs.toFixed(3)),
        ...(request.principal ? { authenticatedUserId: request.principal.id, role: request.principal.role } : {}),
      };
      metrics.recordHttpRequest({ method: request.method, route, statusCode: response.statusCode, durationMs });
      if (durationMs > slowRequestThresholdMs) logger.warn({ ...fields, event: 'slow_http_request' }, 'Slow HTTP request completed');
      else if (response.statusCode >= 500) logger.error(fields, 'HTTP request failed');
      else logger.info(fields, 'HTTP request completed');
    });
    next();
  };
}
