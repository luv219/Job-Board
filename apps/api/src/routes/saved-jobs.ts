import { Router } from 'express';
import type { Environment } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import { SavedJobService } from '../saved-jobs/saved-job-service.js';
import { emptyBodySchema, jobIdParamsSchema, savedJobListSchema, type SavedJobListQuery } from '../saved-jobs/validation.js';
import { privateNoStore } from '../middleware/security.js';

export function createSavedJobRouter(environment: Environment): Router {
  const router = Router();
  const applicantOnly = [privateNoStore, requireAuth(environment), requireRole('APPLICANT')];
  router.post('/applicant/saved-jobs/:jobId', ...applicantOnly, validate('params', jobIdParamsSchema), validate('body', emptyBodySchema), async (request, response, next) => {
    try {
      const result = await new SavedJobService(request.log).save(request.principal!.id, request.params.jobId as string);
      response.status(result.created ? 201 : 200).json(result);
    } catch (error) { next(error); }
  });
  router.delete('/applicant/saved-jobs/:jobId', ...applicantOnly, validate('params', jobIdParamsSchema), validate('body', emptyBodySchema), async (request, response, next) => {
    try { await new SavedJobService(request.log).remove(request.principal!.id, request.params.jobId as string); response.status(204).send(); }
    catch (error) { next(error); }
  });
  router.get('/applicant/saved-jobs', ...applicantOnly, validate('query', savedJobListSchema), async (request, response, next) => {
    try { response.json(await new SavedJobService(request.log).list(request.principal!.id, response.locals.validatedQuery as SavedJobListQuery)); }
    catch (error) { next(error); }
  });
  return router;
}
