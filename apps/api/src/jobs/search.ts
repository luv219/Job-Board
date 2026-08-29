import type mongoose from 'mongoose';
import { Company, type CompanyRecord } from '../models/company.js';
import { Job, type JobRecord } from '../models/job.js';
import { publicActiveJobFilter } from './public-eligibility.js';
import type { PublicJobSearchQuery } from './validation.js';

type WithId<T> = T & { _id: { toString(): string } };
const publicCompanyFields = '_id name slug industry companySize location';

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function exactText(value: string): RegExp { return new RegExp(`^${escapeRegex(value)}$`, 'i'); }
function postedAfter(postedWithin: NonNullable<PublicJobSearchQuery['postedWithin']>, now: Date): Date {
  const milliseconds = { '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 }[postedWithin];
  return new Date(now.getTime() - milliseconds);
}

function buildPublicJobFilter(query: PublicJobSearchQuery, now: Date, companyId?: JobRecord['companyId']): mongoose.QueryFilter<JobRecord> {
  const conditions: mongoose.QueryFilter<JobRecord>[] = [publicActiveJobFilter(now)];
  if (query.q) conditions.push({ $text: { $search: query.q } });
  if (query.city) conditions.push({ 'location.city': exactText(query.city) });
  if (query.state) conditions.push({ 'location.state': exactText(query.state) });
  if (query.country) conditions.push({ 'location.country': exactText(query.country) });
  if (query.workMode) conditions.push({ workMode: query.workMode });
  if (query.employmentType) conditions.push({ employmentType: query.employmentType });
  if (query.skills) conditions.push({ skills: { $in: query.skills.map(exactText) } });
  if (companyId) conditions.push({ companyId });
  if (query.postedWithin) conditions.push({ publishedAt: { $gte: postedAfter(query.postedWithin, now) } });
  if (query.salaryMin !== undefined || query.salaryMax !== undefined) {
    if (!query.currency || !query.salaryPeriod) throw new Error('Validated salary search requires currency and period');
    conditions.push({ 'salary.visible': true, 'salary.currency': query.currency, 'salary.period': query.salaryPeriod });
    if (query.salaryMin !== undefined) conditions.push({ $or: [{ 'salary.max': { $gte: query.salaryMin } }, { 'salary.max': { $exists: false } }] });
    if (query.salaryMax !== undefined) conditions.push({ $or: [{ 'salary.min': { $lte: query.salaryMax } }, { 'salary.min': { $exists: false } }] });
  }
  return { $and: conditions };
}

function toPublicCard(job: WithId<JobRecord>, company: WithId<CompanyRecord>) {
  return {
    id: job._id.toString(), slug: job.slug, title: job.title, skills: job.skills, location: job.location,
    workMode: job.workMode, employmentType: job.employmentType, ...(job.salary?.visible ? { salary: job.salary } : {}),
    ...(job.applicationDeadline ? { applicationDeadline: job.applicationDeadline.toISOString() } : {}), publishedAt: job.publishedAt!.toISOString(),
    company: { id: company._id.toString(), name: company.name, slug: company.slug, ...(company.industry ? { industry: company.industry } : {}), ...(company.companySize ? { companySize: company.companySize } : {}), location: company.location },
  };
}

export async function searchPublicJobs(query: PublicJobSearchQuery, now = new Date()) {
  const company = query.company ? await Company.findOne({ slug: query.company }).select('_id').lean() : undefined;
  if (query.company && !company) return { items: [], pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 } };
  const filter = buildPublicJobFilter(query, now, company?._id as JobRecord['companyId'] | undefined);
  const defaultSort = query.q ? 'relevance' : 'newest';
  const sort = query.sort ?? defaultSort;
  const sortDefinition: Record<string, 1 | -1 | { $meta: 'textScore' }> = sort === 'oldest'
    ? { publishedAt: 1 }
    : sort === 'relevance'
      ? { score: { $meta: 'textScore' }, publishedAt: -1 }
      : { publishedAt: -1 };
  const [jobs, total] = await Promise.all([
    Job.find(filter).select('companyId slug title skills location workMode employmentType salary applicationDeadline publishedAt').sort(sortDefinition).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    Job.countDocuments(filter),
  ]);
  const companyIds = [...new Set(jobs.map((job) => job.companyId.toString()))];
  const companies = await Company.find({ _id: { $in: companyIds } }).select(publicCompanyFields).lean();
  const companiesById = new Map(companies.map((item) => [item._id.toString(), item]));
  const items = jobs.flatMap((job) => {
    const jobCompany = companiesById.get(job.companyId.toString());
    return jobCompany ? [toPublicCard(job, jobCompany)] : [];
  });
  return { items, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
}
