import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Environment } from '../config/env.js';
import { Company } from '../models/company.js';
import { Job, type JobRecord } from '../models/job.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import { employerJobListSchema, jobCreateSchema, jobPatchSchema, publicJobAutocompleteSchema, publicJobSearchSchema, type JobCreateInput, type JobPatchInput, type PublicJobAutocompleteQuery, type PublicJobSearchQuery } from '../jobs/validation.js';
import { canEditJob, canTransition, createJobSlug, isPublishable, type JobAction } from '../jobs/lifecycle.js';
import { employerJobResponse, publicJobResponse } from '../jobs/serializers.js';
import { AppError } from '../lib/app-error.js';
import { isValidObjectId } from '../lib/object-id.js';
import { parseSort } from '../lib/sorting.js';
import { publicActiveJobFilter } from '../jobs/public-eligibility.js';
import { autocompletePublicJobs, searchPublicJobs } from '../jobs/search.js';
import { publicRateLimit, principalRateLimit } from '../middleware/security.js';
import type { OperationalMetrics } from '../lib/metrics.js';

function duplicate(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000; }

function requireJobId(value: unknown): string {
  if (typeof value !== 'string' || !isValidObjectId(value)) throw new AppError({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'Job identifier is invalid' });
  return value;
}

function requireSlug(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 180) throw new AppError({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'Job slug is invalid' });
  return value;
}

async function findOwnedCompany(userId: string) {
  const company = await Company.findOne({ ownerUserId: userId }).lean();
  if (!company) throw new AppError({ statusCode: 409, code: 'COMPANY_REQUIRED', message: 'Create a company before managing jobs' });
  return company;
}

function contentUpdate(input: JobPatchInput): Partial<JobRecord> {
  const update: Partial<JobRecord> = {};
  if (input.title !== undefined) update.title = input.title;
  if (input.description !== undefined) update.description = input.description;
  if (input.requirements !== undefined) update.requirements = input.requirements;
  if (input.skills !== undefined) update.skills = input.skills;
  if (input.location !== undefined) update.location = input.location;
  if (input.workMode !== undefined) update.workMode = input.workMode;
  if (input.employmentType !== undefined) update.employmentType = input.employmentType;
  if (input.salary !== undefined) update.salary = input.salary;
  if (input.applicationDeadline !== undefined) update.applicationDeadline = input.applicationDeadline;
  return update;
}

async function createWithUniqueSlug(input: JobCreateInput, companyId: string, userId: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await Job.create({
        companyId, createdBy: userId, title: input.title, slug: createJobSlug(input.title), description: input.description,
        requirements: input.requirements, skills: input.skills, location: input.location, workMode: input.workMode,
        employmentType: input.employmentType, ...(input.salary ? { salary: input.salary } : {}),
        ...(input.applicationDeadline ? { applicationDeadline: input.applicationDeadline } : {}), status: 'DRAFT',
      });
    } catch (error) {
      if (!duplicate(error) || attempt === 4) throw error;
    }
  }
  throw new AppError({ statusCode: 409, code: 'CONFLICT', message: 'Unable to create a unique job slug' });
}

export function createJobRouter(environment: Environment, metrics: OperationalMetrics): Router {
  const router = Router();
  const employerOnly = [requireAuth(environment), requireRole('EMPLOYER')];

  router.post('/employer/jobs', ...employerOnly, principalRateLimit(30), validate('body', jobCreateSchema), async (request, response, next) => {
    try {
      const company = await findOwnedCompany(request.principal!.id);
      const job = await createWithUniqueSlug(request.body as JobCreateInput, company._id.toString(), request.principal!.id);
      response.status(201).json({ job: employerJobResponse(job) });
    } catch (error) { next(error); }
  });

  router.get('/employer/jobs', ...employerOnly, validate('query', employerJobListSchema), async (request, response, next) => {
    try {
      const company = await findOwnedCompany(request.principal!.id);
      const query = employerJobListSchema.parse(request.query);
      const sort = parseSort(query.sort, ['createdAt', 'updatedAt', 'publishedAt', 'title']) ?? { field: 'createdAt', direction: -1 as const };
      const filter = { companyId: company._id, ...(query.status ? { status: query.status } : {}) };
      const [jobs, total] = await Promise.all([
        Job.find(filter).sort({ [sort.field]: sort.direction }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
        Job.countDocuments(filter),
      ]);
      response.json({ jobs: jobs.map(employerJobResponse), page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) });
    } catch (error) { next(error); }
  });

  router.get('/employer/jobs/:jobId', ...employerOnly, async (request, response, next) => {
    try {
      const company = await findOwnedCompany(request.principal!.id);
      const job = await Job.findOne({ _id: requireJobId(request.params.jobId), companyId: company._id }).lean();
      if (!job) throw new AppError({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      response.json({ job: employerJobResponse(job) });
    } catch (error) { next(error); }
  });

  router.patch('/employer/jobs/:jobId', ...employerOnly, validate('body', jobPatchSchema), async (request, response, next) => {
    try {
      const company = await findOwnedCompany(request.principal!.id);
      const jobId = requireJobId(request.params.jobId);
      const current = await Job.findOne({ _id: jobId, companyId: company._id }).lean();
      if (!current) throw new AppError({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      if (!canEditJob(current.status)) throw new AppError({ statusCode: 409, code: 'JOB_INVALID_TRANSITION', message: 'Closed and archived jobs cannot be edited' });
      const job = await Job.findOneAndUpdate({ _id: jobId, companyId: company._id, status: { $in: ['DRAFT', 'PUBLISHED'] } }, { $set: contentUpdate(request.body as JobPatchInput) }, { returnDocument: 'after', runValidators: true }).lean();
      if (!job) throw new AppError({ statusCode: 409, code: 'JOB_INVALID_TRANSITION', message: 'Job state changed before the update could be applied' });
      response.json({ job: employerJobResponse(job) });
    } catch (error) { next(error); }
  });

  const transition = (action: JobAction) => async (request: Request, response: Response, next: NextFunction) => {
    try {
      const company = await findOwnedCompany(request.principal!.id);
      const jobId = requireJobId(request.params.jobId);
      const current = await Job.findOne({ _id: jobId, companyId: company._id }).lean();
      if (!current) throw new AppError({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      if (!canTransition(current.status, action)) throw new AppError({ statusCode: 409, code: 'JOB_INVALID_TRANSITION', message: 'Job cannot transition from its current state' });
      if (action === 'publish') {
        if (!isPublishable(current)) throw new AppError({ statusCode: 409, code: 'JOB_NOT_PUBLISHABLE', message: 'Job is incomplete or its application deadline has passed' });
        const job = await Job.findOneAndUpdate({ _id: jobId, companyId: company._id, status: 'DRAFT' }, { $set: { status: 'PUBLISHED', publishedAt: new Date() } }, { returnDocument: 'after' }).lean();
        if (!job) throw new AppError({ statusCode: 409, code: 'JOB_INVALID_TRANSITION', message: 'Job state changed before publication could be applied' });
        response.json({ job: employerJobResponse(job) });
        return;
      }
      const expectedStatuses: JobRecord['status'][] = action === 'close' ? ['PUBLISHED'] : ['DRAFT', 'CLOSED'];
      const timestamp: Pick<JobRecord, 'status'> & Partial<Pick<JobRecord, 'closedAt' | 'archivedAt'>> = action === 'close'
        ? { status: 'CLOSED', closedAt: new Date() }
        : { status: 'ARCHIVED', archivedAt: new Date() };
      const job = await Job.findOneAndUpdate({ _id: jobId, companyId: company._id, status: { $in: expectedStatuses } }, { $set: timestamp }, { returnDocument: 'after' }).lean();
      if (!job) throw new AppError({ statusCode: 409, code: 'JOB_INVALID_TRANSITION', message: 'Job state changed before the transition could be applied' });
      response.json({ job: employerJobResponse(job) });
    } catch (error) { next(error); }
  };

  router.post('/employer/jobs/:jobId/publish', ...employerOnly, principalRateLimit(30), transition('publish'));
  router.post('/employer/jobs/:jobId/close', ...employerOnly, principalRateLimit(30), transition('close'));
  router.post('/employer/jobs/:jobId/archive', ...employerOnly, principalRateLimit(30), transition('archive'));

  router.get('/jobs', publicRateLimit(120), validate('query', publicJobSearchSchema), async (_request, response, next) => {
    try {
      response.json(await searchPublicJobs(response.locals.validatedQuery as PublicJobSearchQuery, environment, metrics));
    } catch (error) { next(error); }
  });

  router.get('/jobs/autocomplete', publicRateLimit(60, 60_000), validate('query', publicJobAutocompleteSchema), async (_request, response, next) => {
    try { response.json(await autocompletePublicJobs(response.locals.validatedQuery as PublicJobAutocompleteQuery, metrics)); }
    catch (error) { next(error); }
  });

  router.get('/jobs/:slug', async (request, response, next) => {
    try {
      const job = await Job.findOne({ ...publicActiveJobFilter(new Date()), slug: requireSlug(request.params.slug) }).lean();
      if (!job) throw new AppError({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      const company = await Company.findById(job.companyId).lean();
      if (!company) throw new AppError({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      response.json({ job: publicJobResponse(job, company) });
    } catch (error) { next(error); }
  });

  return router;
}
