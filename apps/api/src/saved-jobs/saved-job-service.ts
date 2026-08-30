import type { Logger } from 'pino';
import { Company, type CompanyRecord } from '../models/company.js';
import { Job, type JobRecord } from '../models/job.js';
import { SavedJob, type SavedJobRecord } from '../models/saved-job.js';
import { AppError } from '../lib/app-error.js';
import { isJobOpenForApplications } from '../jobs/public-eligibility.js';
import type { SavedJobListQuery } from './validation.js';

type WithId<T> = T & { _id: { toString(): string } };
type SavedJobItem = WithId<SavedJobRecord>;

function duplicate(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000; }

function safeJob(job: WithId<JobRecord>, company: WithId<CompanyRecord>, now: Date) {
  const isActive = isJobOpenForApplications(job, now);
  return {
    isActive,
    availability: isActive ? 'ACTIVE' : job.status === 'PUBLISHED' ? 'EXPIRED' : job.status,
    job: {
      id: job._id.toString(), slug: job.slug, title: job.title, skills: job.skills, location: job.location,
      workMode: job.workMode, employmentType: job.employmentType,
      ...(job.salary?.visible ? { salary: job.salary } : {}),
      ...(job.applicationDeadline ? { applicationDeadline: job.applicationDeadline.toISOString() } : {}),
      ...(job.publishedAt ? { publishedAt: job.publishedAt.toISOString() } : {}),
      status: job.status,
      company: {
        name: company.name, slug: company.slug, ...(company.industry ? { industry: company.industry } : {}), location: company.location,
      },
    },
  };
}

export class SavedJobService {
  public constructor(private readonly logger: Logger) {}

  public async save(applicantUserId: string, jobId: string) {
    const job = await Job.findOne({ _id: jobId }).lean();
    if (!job || !isJobOpenForApplications(job, new Date())) throw new AppError({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
    try {
      const savedJob = await SavedJob.create({ applicantUserId, jobId: job._id });
      this.logger.info({ event: 'job_saved', applicantUserId, jobId }, 'Job saved');
      return { savedJob: this.serializeReference(savedJob), created: true };
    } catch (error) {
      if (!duplicate(error)) throw error;
      const savedJob = await SavedJob.findOne({ applicantUserId, jobId: job._id }).lean();
      if (!savedJob) throw error;
      return { savedJob: this.serializeReference(savedJob), created: false };
    }
  }

  public async remove(applicantUserId: string, jobId: string): Promise<void> {
    await SavedJob.deleteOne({ applicantUserId, jobId });
    this.logger.info({ event: 'job_unsaved', applicantUserId, jobId }, 'Job unsaved');
  }

  public async list(applicantUserId: string, query: SavedJobListQuery) {
    const filter = { applicantUserId };
    const sort = query.sort === 'oldest_saved' ? { createdAt: 1 as const, _id: 1 as const } : { createdAt: -1 as const, _id: -1 as const };
    const [savedJobs, total] = await Promise.all([
      SavedJob.find(filter).sort(sort).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
      SavedJob.countDocuments(filter),
    ]);
    return { savedJobs: await this.items(savedJobs), page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  public async recent(applicantUserId: string, limit = 5) {
    const savedJobs = await SavedJob.find({ applicantUserId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
    return this.items(savedJobs);
  }

  private async items(savedJobs: SavedJobItem[]) {
    const now = new Date();
    const jobs = await Job.find({ _id: { $in: savedJobs.map((savedJob) => savedJob.jobId) } })
      .select('_id companyId slug title skills location workMode employmentType salary status applicationDeadline publishedAt').lean() as WithId<JobRecord>[];
    const companies = await Company.find({ _id: { $in: jobs.map((job) => job.companyId) } })
      .select('_id name slug industry location').lean() as WithId<CompanyRecord>[];
    const jobsById = new Map(jobs.map((job) => [job._id.toString(), job]));
    const companiesById = new Map(companies.map((company) => [company._id.toString(), company]));
    return savedJobs.map((savedJob) => {
      const job = jobsById.get(savedJob.jobId.toString());
      const company = job ? companiesById.get(job.companyId.toString()) : undefined;
      const historical = job && company && job.status !== 'DRAFT' ? safeJob(job, company, now) : { isActive: false, availability: 'UNAVAILABLE' as const, job: null };
      return { id: savedJob._id.toString(), savedAt: savedJob.createdAt.toISOString(), ...historical };
    });
  }

  private serializeReference(savedJob: WithId<SavedJobRecord>) {
    return { id: savedJob._id.toString(), savedAt: savedJob.createdAt.toISOString() };
  }
}
