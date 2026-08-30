import { Company, type CompanyRecord } from '../models/company.js';
import { CompanyMember } from '../models/company-member.js';
import { AppError } from '../lib/app-error.js';
import type { CompanyRole } from '@job-board/contracts';
import type { Types } from 'mongoose';

export type CompanyAccess = { company: CompanyRecord & { _id: Types.ObjectId }; companyRole: CompanyRole };
export async function resolveEmployerCompanyAccess(userId: string): Promise<CompanyAccess> {
  const owned = await Company.findOne({ ownerUserId: userId }).lean();
  if (owned) return { company: owned, companyRole: 'OWNER' };
  const membership = await CompanyMember.findOne({ userId }).lean();
  if (!membership) throw new AppError({ statusCode: 409, code: 'COMPANY_REQUIRED', message: 'Join or create a company before accessing employer resources' });
  const company = await Company.findById(membership.companyId).lean();
  if (!company) throw new AppError({ statusCode: 404, code: 'COMPANY_NOT_FOUND', message: 'Company not found' });
  return { company, companyRole: membership.role };
}
export async function requireCompanyOwner(userId: string): Promise<CompanyAccess> {
  const access = await resolveEmployerCompanyAccess(userId);
  if (access.companyRole !== 'OWNER') throw new AppError({ statusCode: 403, code: 'FORBIDDEN', message: 'Company owner access is required' });
  return access;
}
