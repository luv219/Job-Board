import { Router } from 'express';
import { ApplicantProfile } from '../models/applicant-profile.js';
import { EmployerProfile } from '../models/employer-profile.js';
import { Company } from '../models/company.js';
import type { Environment } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import { applicantCreateSchema, applicantPatchSchema, companyCreateSchema, companyPatchSchema, employerCreateSchema, employerPatchSchema } from '../profiles/validation.js';
import { applicantProfileResponse, companyPublicResponse, employerProfileResponse } from '../profiles/serializers.js';
import { AppError } from '../lib/app-error.js';
import { slugify } from '../profiles/slug.js';
import { privateNoStore } from '../middleware/security.js';

function duplicate(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000; }

export function createProfileRouter(environment: Environment): Router {
  const router = Router();
  const applicantOnly = [privateNoStore, requireAuth(environment), requireRole('APPLICANT')];
  const employerOnly = [privateNoStore, requireAuth(environment), requireRole('EMPLOYER')];

  router.post('/applicant/profile', ...applicantOnly, validate('body', applicantCreateSchema), async (request, response, next) => { try { const profile = await ApplicantProfile.create({ ...(request.body as object), userId: request.principal!.id }); response.status(201).json({ profile: applicantProfileResponse(profile) }); } catch (error) { next(duplicate(error) ? new AppError({ statusCode: 409, code: 'PROFILE_ALREADY_EXISTS', message: 'Applicant profile already exists' }) : error); } });
  router.get('/applicant/profile', ...applicantOnly, async (request, response, next) => { try { const profile = await ApplicantProfile.findOne({ userId: request.principal!.id }).lean(); if (!profile) throw new AppError({ statusCode: 404, code: 'PROFILE_NOT_FOUND', message: 'Applicant profile not found' }); response.json({ profile: applicantProfileResponse(profile) }); } catch (error) { next(error); } });
  router.patch('/applicant/profile', ...applicantOnly, validate('body', applicantPatchSchema), async (request, response, next) => { try { const profile = await ApplicantProfile.findOneAndUpdate({ userId: request.principal!.id }, { $set: request.body }, { new: true, runValidators: true }).lean(); if (!profile) throw new AppError({ statusCode: 404, code: 'PROFILE_NOT_FOUND', message: 'Applicant profile not found' }); response.json({ profile: applicantProfileResponse(profile) }); } catch (error) { next(error); } });

  router.post('/employer/profile', ...employerOnly, validate('body', employerCreateSchema), async (request, response, next) => { try { const profile = await EmployerProfile.create({ ...(request.body as object), userId: request.principal!.id }); response.status(201).json({ profile: employerProfileResponse(profile) }); } catch (error) { next(duplicate(error) ? new AppError({ statusCode: 409, code: 'PROFILE_ALREADY_EXISTS', message: 'Employer profile already exists' }) : error); } });
  router.get('/employer/profile', ...employerOnly, async (request, response, next) => { try { const profile = await EmployerProfile.findOne({ userId: request.principal!.id }).lean(); if (!profile) throw new AppError({ statusCode: 404, code: 'PROFILE_NOT_FOUND', message: 'Employer profile not found' }); response.json({ profile: employerProfileResponse(profile) }); } catch (error) { next(error); } });
  router.patch('/employer/profile', ...employerOnly, validate('body', employerPatchSchema), async (request, response, next) => { try { const profile = await EmployerProfile.findOneAndUpdate({ userId: request.principal!.id }, { $set: request.body }, { new: true, runValidators: true }).lean(); if (!profile) throw new AppError({ statusCode: 404, code: 'PROFILE_NOT_FOUND', message: 'Employer profile not found' }); response.json({ profile: employerProfileResponse(profile) }); } catch (error) { next(error); } });

  router.post('/employer/company', ...employerOnly, validate('body', companyCreateSchema), async (request, response, next) => { try {
    const input = request.body as { name: string }; let company;
    for (let suffix = 1; suffix <= 100; suffix += 1) { const slug = `${slugify(input.name)}${suffix === 1 ? '' : `-${suffix}`}`; try { company = await Company.create({ ...(request.body as object), ownerUserId: request.principal!.id, slug }); break; } catch (error) { if (!duplicate(error)) throw error; const own = await Company.exists({ ownerUserId: request.principal!.id }); if (own) throw new AppError({ statusCode: 409, code: 'COMPANY_ALREADY_EXISTS', message: 'Company already exists' }); } }
    if (!company) throw new AppError({ statusCode: 409, code: 'CONFLICT', message: 'Unable to create a unique company slug' }); response.status(201).json({ company: companyPublicResponse(company) });
  } catch (error) { next(error); } });
  router.get('/employer/company', ...employerOnly, async (request, response, next) => { try { const company = await Company.findOne({ ownerUserId: request.principal!.id }).lean(); if (!company) throw new AppError({ statusCode: 404, code: 'COMPANY_NOT_FOUND', message: 'Company not found' }); response.json({ company: companyPublicResponse(company) }); } catch (error) { next(error); } });
  router.patch('/employer/company', ...employerOnly, validate('body', companyPatchSchema), async (request, response, next) => { try { const company = await Company.findOneAndUpdate({ ownerUserId: request.principal!.id }, { $set: request.body }, { new: true, runValidators: true }).lean(); if (!company) throw new AppError({ statusCode: 404, code: 'COMPANY_NOT_FOUND', message: 'Company not found' }); response.json({ company: companyPublicResponse(company) }); } catch (error) { next(error); } });
  router.get('/companies/:slug', async (request, response, next) => { try { const company = await Company.findOne({ slug: request.params.slug }).lean(); if (!company) throw new AppError({ statusCode: 404, code: 'COMPANY_NOT_FOUND', message: 'Company not found' }); response.json({ company: companyPublicResponse(company) }); } catch (error) { next(error); } });
  return router;
}
