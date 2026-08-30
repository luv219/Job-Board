import { Router } from 'express';
import type { OperationalMetrics } from '../lib/metrics.js';

export function createMetricsRouter(metrics: OperationalMetrics): Router {
  const router = Router();
  router.get('/', async (_request, response, next) => {
    try {
      response.set('Content-Type', metrics.registry.contentType);
      response.set('Cache-Control', 'no-store');
      response.send(await metrics.registry.metrics());
    } catch (error) { next(error); }
  });
  return router;
}
