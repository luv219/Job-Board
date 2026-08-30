import { Router } from 'express';
import type { Environment } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import { ApplicationService } from '../applications/application-service.js';
import { applicantApplicationListSchema, applicationIdParamsSchema, jobApplicationParamsSchema, submitApplicationSchema, type ApplicantApplicationListQuery, type SubmitApplicationInput } from '../applications/validation.js';
import { createResumeStorageProvider } from '../resume/storage/create-resume-storage-provider.js';
import type { ResumeStorageProvider } from '../resume/storage/resume-storage-provider.js';
import type { EmailNotificationService } from '../notifications/email-notification-service.js';

export function createApplicationRouter(environment: Environment, notifications: EmailNotificationService, storage: ResumeStorageProvider = createResumeStorageProvider(environment)): Router {
  const router = Router();
  const applicantOnly = [requireAuth(environment), requireRole('APPLICANT')];

  router.post('/jobs/:jobId/applications', ...applicantOnly, validate('params', jobApplicationParamsSchema), validate('body', submitApplicationSchema), async (request, response, next) => {
    try { response.status(201).json({ application: await new ApplicationService(storage, request.log, notifications).submit(request.principal!.id, request.params.jobId as string, request.body as SubmitApplicationInput) }); }
    catch (error) { next(error); }
  });
  router.get('/applicant/applications', ...applicantOnly, validate('query', applicantApplicationListSchema), async (request, response, next) => {
    try { response.json(await new ApplicationService(storage, request.log, notifications).list(request.principal!.id, response.locals.validatedQuery as ApplicantApplicationListQuery)); }
    catch (error) { next(error); }
  });
  router.get('/applicant/applications/:applicationId', ...applicantOnly, validate('params', applicationIdParamsSchema), async (request, response, next) => {
    try { response.json({ application: await new ApplicationService(storage, request.log, notifications).get(request.principal!.id, request.params.applicationId as string) }); }
    catch (error) { next(error); }
  });
  router.post('/applicant/applications/:applicationId/withdraw', ...applicantOnly, validate('params', applicationIdParamsSchema), async (request, response, next) => {
    try { response.json({ application: await new ApplicationService(storage, request.log, notifications).withdraw(request.principal!.id, request.params.applicationId as string) }); }
    catch (error) { next(error); }
  });
  return router;
}
