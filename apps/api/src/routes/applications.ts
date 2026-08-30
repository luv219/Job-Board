import { Router } from 'express';
import type { Environment } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import { ApplicationService } from '../applications/application-service.js';
import { applicantApplicationListSchema, applicationIdParamsSchema, jobApplicationParamsSchema, submitApplicationSchema, type ApplicantApplicationListQuery, type SubmitApplicationInput } from '../applications/validation.js';
import { createResumeStorageProvider } from '../resume/storage/create-resume-storage-provider.js';
import type { ResumeStorageProvider } from '../resume/storage/resume-storage-provider.js';
import type { EmailNotificationService } from '../notifications/email-notification-service.js';
import { principalRateLimit } from '../middleware/security.js';
import { privateNoStore } from '../middleware/security.js';
import type { OperationalMetrics } from '../lib/metrics.js';

export function createApplicationRouter(environment: Environment, notifications: EmailNotificationService, metrics: OperationalMetrics, storage: ResumeStorageProvider = createResumeStorageProvider(environment)): Router {
  const router = Router();
  const applicantOnly = [privateNoStore, requireAuth(environment), requireRole('APPLICANT')];

  router.post('/jobs/:jobId/applications', ...applicantOnly, principalRateLimit(20), validate('params', jobApplicationParamsSchema), validate('body', submitApplicationSchema), async (request, response, next) => {
    try { const application = await new ApplicationService(storage, request.log, notifications, metrics).submit(request.principal!.id, request.params.jobId as string, request.body as SubmitApplicationInput); metrics.recordApplicationSubmission('success'); response.status(201).json({ application }); }
    catch (error) { metrics.recordApplicationSubmission('failure'); next(error); }
  });
  router.get('/applicant/applications', ...applicantOnly, validate('query', applicantApplicationListSchema), async (request, response, next) => {
    try { response.json(await new ApplicationService(storage, request.log, notifications, metrics).list(request.principal!.id, response.locals.validatedQuery as ApplicantApplicationListQuery)); }
    catch (error) { next(error); }
  });
  router.get('/applicant/applications/:applicationId', ...applicantOnly, validate('params', applicationIdParamsSchema), async (request, response, next) => {
    try { response.json({ application: await new ApplicationService(storage, request.log, notifications, metrics).get(request.principal!.id, request.params.applicationId as string) }); }
    catch (error) { next(error); }
  });
  router.post('/applicant/applications/:applicationId/withdraw', ...applicantOnly, principalRateLimit(30), validate('params', applicationIdParamsSchema), async (request, response, next) => {
    try { response.json({ application: await new ApplicationService(storage, request.log, notifications, metrics).withdraw(request.principal!.id, request.params.applicationId as string) }); }
    catch (error) { next(error); }
  });
  return router;
}
