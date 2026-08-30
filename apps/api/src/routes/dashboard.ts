import { Router } from 'express';
import type { Environment } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import { ApplicantDashboardService } from '../dashboard/applicant-dashboard-service.js';
import { dashboardQuerySchema } from '../saved-jobs/validation.js';
import { privateNoStore } from '../middleware/security.js';

export function createApplicantDashboardRouter(environment: Environment): Router {
  const router = Router();
  router.get('/applicant/dashboard', privateNoStore, requireAuth(environment), requireRole('APPLICANT'), validate('query', dashboardQuerySchema), async (request, response, next) => {
    try { response.json(await new ApplicantDashboardService(request.log).get(request.principal!.id)); }
    catch (error) { next(error); }
  });
  return router;
}
