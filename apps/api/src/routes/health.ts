import { Router } from 'express';
import { healthResponseSchema, notReadyResponseSchema } from '@job-board/contracts';

export function createHealthRouter(isDatabaseReady: () => boolean): Router {
  const router = Router();

  router.get('/live', (_request, response) => {
    response.status(200).json(healthResponseSchema.parse({ status: 'ok' }));
  });

  router.get('/ready', (_request, response) => {
    if (!isDatabaseReady()) {
      response.status(503).json(notReadyResponseSchema.parse({ status: 'not_ready' }));
      return;
    }
    response.status(200).json(healthResponseSchema.parse({ status: 'ok' }));
  });

  return router;
}
