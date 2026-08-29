import type { JobRecord } from '../models/job.js';
import type { CompanyRecord } from '../models/company.js';

type WithId<T> = T & { _id: { toString(): string } };

function date(value: Date | undefined): string | undefined { return value?.toISOString(); }

export function employerJobResponse(job: WithId<JobRecord>) {
  return {
    id: job._id.toString(), companyId: job.companyId.toString(), title: job.title, slug: job.slug, description: job.description,
    requirements: job.requirements, skills: job.skills, location: job.location, workMode: job.workMode, employmentType: job.employmentType,
    ...(job.salary ? { salary: job.salary } : {}), status: job.status,
    ...(date(job.applicationDeadline) ? { applicationDeadline: date(job.applicationDeadline) } : {}),
    ...(date(job.publishedAt) ? { publishedAt: date(job.publishedAt) } : {}), ...(date(job.closedAt) ? { closedAt: date(job.closedAt) } : {}),
    ...(date(job.archivedAt) ? { archivedAt: date(job.archivedAt) } : {}), createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString(),
  };
}

export function publicJobResponse(job: WithId<JobRecord>, company: WithId<CompanyRecord>) {
  return {
    id: job._id.toString(), slug: job.slug, title: job.title, description: job.description, requirements: job.requirements, skills: job.skills,
    location: job.location, workMode: job.workMode, employmentType: job.employmentType,
    ...(job.salary?.visible ? { salary: job.salary } : {}),
    ...(date(job.applicationDeadline) ? { applicationDeadline: date(job.applicationDeadline) } : {}),
    publishedAt: job.publishedAt!.toISOString(), company: {
      id: company._id.toString(), name: company.name, slug: company.slug,
      ...(company.description ? { description: company.description } : {}), ...(company.website ? { website: company.website } : {}),
      ...(company.industry ? { industry: company.industry } : {}), ...(company.companySize ? { companySize: company.companySize } : {}), location: company.location,
    },
  };
}
