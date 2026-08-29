import { Router } from 'express';
import { healthResponseSchema, notReadyResponseSchema, readyResponseSchema } from '@job-board/contracts';

export function createHealthRouter(isDatabaseReady: () => boolean): Router {
  const router = Router();

  router.get('/live', (_request, response) => {
    response.status(200).json(healthResponseSchema.parse({ status: 'ok' }));
  });

  router.get('/ready', (_request, response) => {
    if (!isDatabaseReady()) {
      response.status(503).json(notReadyResponseSchema.parse({ status: 'not_ready', dependencies: { mongodb: 'unavailable' } }));
      return;
    }
    response.status(200).json(readyResponseSchema.parse({ status: 'ready', dependencies: { mongodb: 'available' } }));
  });

  return router;
}
