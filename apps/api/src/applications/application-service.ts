import type { Logger } from 'pino';
import type mongoose from 'mongoose';
import { Application, type ApplicantVisibleApplicationStatus, type ApplicationRecord } from '../models/application.js';
import { ApplicantProfile } from '../models/applicant-profile.js';
import { Job } from '../models/job.js';
import { Company } from '../models/company.js';
import { publicActiveJobFilter, isJobOpenForApplications } from '../jobs/public-eligibility.js';
import { AppError } from '../lib/app-error.js';
import type { ApplicantApplicationListQuery, SubmitApplicationInput } from './validation.js';
import type { ResumeStorageProvider } from '../resume/storage/resume-storage-provider.js';

type PersistedApplication = ApplicationRecord & { _id: { toString(): string } };
type JobSummaryRecord = { _id: { toString(): string }; companyId: { toString(): string }; slug: string; title: string; workMode: string; employmentType: string };
type CompanySummaryRecord = { _id: { toString(): string }; name: string; slug: string };

function duplicate(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000; }

function safeSnapshot(snapshot: NonNullable<ApplicationRecord['resumeSnapshot']>) {
  return { originalFilename: snapshot.originalFilename, mimeType: snapshot.mimeType, sizeBytes: snapshot.sizeBytes, capturedAt: snapshot.capturedAt.toISOString() };
}

export class ApplicationService {
  public constructor(private readonly storage: ResumeStorageProvider, private readonly logger: Logger) {}

  public async submit(applicantUserId: string, jobId: string, input: SubmitApplicationInput) {
    const profile = await ApplicantProfile.findOne({ userId: applicantUserId }).lean();
    if (!profile) throw new AppError({ statusCode: 409, code: 'APPLICANT_PROFILE_REQUIRED', message: 'Create an applicant profile before applying' });
    if (!profile.resume) throw new AppError({ statusCode: 409, code: 'RESUME_REQUIRED', message: 'Upload a resume before applying' });

    const job = await Job.findById(jobId).lean();
    if (!job || job.status !== 'PUBLISHED') throw new AppError({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
    if (!isJobOpenForApplications(job, new Date())) throw new AppError({ statusCode: 409, code: 'JOB_NOT_ACCEPTING_APPLICATIONS', message: 'Job is not accepting applications' });

    const appliedAt = new Date();
    let reservation: PersistedApplication;
    try {
      reservation = await Application.create({
        jobId: job._id, companyId: job.companyId, applicantUserId, ...(input.coverLetter ? { coverLetter: input.coverLetter } : {}),
        status: 'CREATING', appliedAt,
      });
    } catch (error) {
      if (duplicate(error)) throw new AppError({ statusCode: 409, code: 'APPLICATION_ALREADY_EXISTS', message: 'You have already applied to this job' });
      throw error;
    }

    const stillOpen = await Job.exists({ _id: job._id, ...publicActiveJobFilter(new Date()) });
    if (!stillOpen) {
      await this.removeReservation(reservation._id.toString());
      throw new AppError({ statusCode: 409, code: 'JOB_NOT_ACCEPTING_APPLICATIONS', message: 'Job is not accepting applications' });
    }

    let snapshot;
    try { snapshot = await this.storage.createApplicationSnapshot({ sourceAssetId: profile.resume.assetId, mimeType: profile.resume.mimeType }); }
    catch { await this.removeReservation(reservation._id.toString()); throw new AppError({ statusCode: 503, code: 'RESUME_SNAPSHOT_ERROR', message: 'Resume snapshot storage is temporarily unavailable' }); }

    const resumeSnapshot: NonNullable<ApplicationRecord['resumeSnapshot']> = {
      provider: snapshot.provider, assetId: snapshot.assetId, originalFilename: profile.resume.originalFilename,
      mimeType: profile.resume.mimeType, sizeBytes: snapshot.sizeBytes, capturedAt: new Date(),
    };
    let application: PersistedApplication | null;
    try {
      application = await Application.findOneAndUpdate(
        { _id: reservation._id, applicantUserId, status: 'CREATING' },
        { $set: { status: 'SUBMITTED', resumeSnapshot } },
        { returnDocument: 'after', runValidators: true },
      ).lean();
    } catch (error) {
      await this.discardSnapshot(snapshot.assetId);
      await this.removeReservation(reservation._id.toString());
      throw error;
    }
    if (!application) {
      await this.discardSnapshot(snapshot.assetId);
      await this.removeReservation(reservation._id.toString());
      throw new AppError({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Unable to finalize application submission' });
    }
    this.logger.info({ event: 'application_submitted', applicationId: application._id.toString() }, 'Application submitted');
    return this.withJobSummary(application);
  }

  public async list(applicantUserId: string, query: ApplicantApplicationListQuery) {
    const visibleStatuses: ApplicantVisibleApplicationStatus[] = ['SUBMITTED', 'WITHDRAWN'];
    const filter: mongoose.QueryFilter<ApplicationRecord> = {
      applicantUserId,
      status: query.status ? query.status as ApplicantVisibleApplicationStatus : { $in: visibleStatuses },
    };
    const [applications, total] = await Promise.all([
      Application.find(filter).sort({ appliedAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
      Application.countDocuments(filter),
    ]);
    const summaries = await this.jobSummaries(applications);
    return { applications: applications.map((application) => this.serialize(application, summaries)), page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  public async get(applicantUserId: string, applicationId: string) {
    const application = await Application.findOne({ _id: applicationId, applicantUserId, status: { $in: ['SUBMITTED', 'WITHDRAWN'] } }).lean();
    if (!application) throw new AppError({ statusCode: 404, code: 'APPLICATION_NOT_FOUND', message: 'Application not found' });
    return this.withJobSummary(application);
  }

  public async withdraw(applicantUserId: string, applicationId: string) {
    const application = await Application.findOneAndUpdate(
      { _id: applicationId, applicantUserId, status: 'SUBMITTED' },
      { $set: { status: 'WITHDRAWN', withdrawnAt: new Date() } },
      { returnDocument: 'after' },
    ).lean();
    if (application) {
      this.logger.info({ event: 'application_withdrawn', applicationId }, 'Application withdrawn');
      return this.withJobSummary(application);
    }
    const existing = await Application.exists({ _id: applicationId, applicantUserId, status: { $in: ['SUBMITTED', 'WITHDRAWN'] } });
    if (!existing) throw new AppError({ statusCode: 404, code: 'APPLICATION_NOT_FOUND', message: 'Application not found' });
    throw new AppError({ statusCode: 409, code: 'APPLICATION_NOT_WITHDRAWABLE', message: 'Application cannot be withdrawn from its current state' });
  }

  private async withJobSummary(application: PersistedApplication) {
    return this.serialize(application, await this.jobSummaries([application]));
  }

  private async jobSummaries(applications: PersistedApplication[]) {
    const jobIds = applications.map((application) => application.jobId);
    const jobs = await Job.find({ _id: { $in: jobIds } }).select('_id companyId slug title workMode employmentType').lean() as JobSummaryRecord[];
    const companies = await Company.find({ _id: { $in: jobs.map((job) => job.companyId) } }).select('_id name slug').lean() as CompanySummaryRecord[];
    return { jobs: new Map(jobs.map((job) => [job._id.toString(), job])), companies: new Map(companies.map((company) => [company._id.toString(), company])) };
  }

  private serialize(application: PersistedApplication, summaries: Awaited<ReturnType<ApplicationService['jobSummaries']>>) {
    const job = summaries.jobs.get(application.jobId.toString());
    const company = job ? summaries.companies.get(job.companyId.toString()) : undefined;
    return {
      id: application._id.toString(), status: application.status as ApplicantVisibleApplicationStatus, appliedAt: application.appliedAt.toISOString(),
      ...(application.withdrawnAt ? { withdrawnAt: application.withdrawnAt.toISOString() } : {}),
      ...(application.coverLetter ? { coverLetter: application.coverLetter } : {}), resumeSnapshot: safeSnapshot(application.resumeSnapshot!),
      job: job && company ? { id: job._id.toString(), slug: job.slug, title: job.title, workMode: job.workMode, employmentType: job.employmentType, company: { id: company._id.toString(), name: company.name, slug: company.slug } } : null,
    };
  }

  private async removeReservation(applicationId: string): Promise<void> {
    try { await Application.deleteOne({ _id: applicationId, status: 'CREATING' }); }
    catch { this.logger.warn({ event: 'application_reservation_cleanup_failed' }, 'Application reservation cleanup failed'); }
  }

  private async discardSnapshot(assetId: string): Promise<void> {
    try { await this.storage.deleteResume(assetId); }
    catch { this.logger.warn({ event: 'application_snapshot_cleanup_failed' }, 'Application snapshot cleanup failed'); }
  }
}
