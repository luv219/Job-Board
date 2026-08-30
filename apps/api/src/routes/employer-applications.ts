import { Router } from 'express';
import type { Environment } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import { EmployerApplicationService } from '../applications/employer-application-service.js';
import { applicationIdParamsSchema, employerApplicationListSchema, employerApplicationStatusSchema, jobApplicationParamsSchema, type ApplicantApplicationListQuery, type EmployerApplicationStatusInput } from '../applications/validation.js';
import { createResumeStorageProvider } from '../resume/storage/create-resume-storage-provider.js';
import type { ResumeStorageProvider } from '../resume/storage/resume-storage-provider.js';
import type { EmailNotificationService } from '../notifications/email-notification-service.js';
import { principalRateLimit } from '../middleware/security.js';
import { privateNoStore } from '../middleware/security.js';

export function createEmployerApplicationRouter(environment: Environment, notifications: EmailNotificationService, storage: ResumeStorageProvider = createResumeStorageProvider(environment)): Router {
  const router = Router();
  const employerOnly = [privateNoStore, requireAuth(environment), requireRole('EMPLOYER')];
  router.get('/employer/jobs/:jobId/applications', ...employerOnly, validate('params', jobApplicationParamsSchema), validate('query', employerApplicationListSchema), async (request, response, next) => {
    try { response.json(await new EmployerApplicationService(storage, request.log, notifications).listForJob(request.principal!.id, request.params.jobId as string, response.locals.validatedQuery as ApplicantApplicationListQuery)); }
    catch (error) { next(error); }
  });
  router.get('/employer/applications/:applicationId', ...employerOnly, validate('params', applicationIdParamsSchema), async (request, response, next) => {
    try { response.json({ application: await new EmployerApplicationService(storage, request.log, notifications).get(request.principal!.id, request.params.applicationId as string) }); }
    catch (error) { next(error); }
  });
  router.patch('/employer/applications/:applicationId/status', ...employerOnly, principalRateLimit(30), validate('params', applicationIdParamsSchema), validate('body', employerApplicationStatusSchema), async (request, response, next) => {
    try { response.json({ application: await new EmployerApplicationService(storage, request.log, notifications).transition(request.principal!.id, request.params.applicationId as string, (request.body as EmployerApplicationStatusInput).status) }); }
    catch (error) { next(error); }
  });
  router.post('/employer/applications/:applicationId/resume/access', ...employerOnly, validate('params', applicationIdParamsSchema), async (request, response, next) => {
    try {
      const access = await new EmployerApplicationService(storage, request.log, notifications).createSnapshotAccess(request.principal!.id, request.params.applicationId as string);
      response.set('Cache-Control', 'private, no-store').json({ accessUrl: access.accessUrl, expiresAt: access.expiresAt.toISOString() });
    } catch (error) { next(error); }
  });
  return router;
}
