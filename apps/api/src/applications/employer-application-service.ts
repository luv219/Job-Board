import type { Logger } from 'pino';
import type mongoose from 'mongoose';
import { Application, applicantVisibleApplicationStatuses, type ApplicantVisibleApplicationStatus, type ApplicationRecord } from '../models/application.js';
import { ApplicantProfile } from '../models/applicant-profile.js';
import { Company } from '../models/company.js';
import { Job } from '../models/job.js';
import { AppError } from '../lib/app-error.js';
import type { ResumeStorageProvider } from '../resume/storage/resume-storage-provider.js';
import type { ApplicantApplicationListQuery } from './validation.js';
import type { EmployerApplicationStatus } from './lifecycle.js';
import { canEmployerTransition } from './lifecycle.js';

type PersistedApplication = ApplicationRecord & { _id: { toString(): string } };
type ApplicantProfileSummary = { userId: { toString(): string }; fullName: string; headline?: string; bio?: string; location: { city: string; state?: string; country: string }; skills: string[]; experience: unknown[]; education: unknown[] };

function safeSnapshot(snapshot: NonNullable<ApplicationRecord['resumeSnapshot']>) {
  return { originalFilename: snapshot.originalFilename, mimeType: snapshot.mimeType, sizeBytes: snapshot.sizeBytes, capturedAt: snapshot.capturedAt.toISOString() };
}

function candidateSummary(profile: ApplicantProfileSummary | undefined) {
  return profile ? {
    fullName: profile.fullName, ...(profile.headline ? { headline: profile.headline } : {}), location: profile.location, skills: profile.skills,
  } : null;
}

function candidateDetail(profile: ApplicantProfileSummary | undefined) {
  return profile ? {
    fullName: profile.fullName, ...(profile.headline ? { headline: profile.headline } : {}), ...(profile.bio ? { bio: profile.bio } : {}),
    location: profile.location, skills: profile.skills, experience: profile.experience, education: profile.education,
  } : null;
}

export class EmployerApplicationService {
  public constructor(private readonly storage: ResumeStorageProvider, private readonly logger: Logger) {}

  public async listForJob(employerUserId: string, jobId: string, query: ApplicantApplicationListQuery) {
    const company = await this.ownedCompany(employerUserId);
    const job = await Job.findOne({ _id: jobId, companyId: company._id }).lean();
    if (!job) throw new AppError({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
    const filter: mongoose.QueryFilter<ApplicationRecord> = {
      jobId: job._id, companyId: company._id,
      status: query.status ? query.status as ApplicantVisibleApplicationStatus : { $in: applicantVisibleApplicationStatuses },
    };
    const [applications, total] = await Promise.all([
      Application.find(filter).sort({ updatedAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
      Application.countDocuments(filter),
    ]);
    const profiles = await this.profilesFor(applications);
    return {
      applications: applications.map((application) => this.listItem(application, profiles)),
      page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit),
    };
  }

  public async get(employerUserId: string, applicationId: string) {
    const { application, job } = await this.ownedApplication(employerUserId, applicationId);
    const profile = await ApplicantProfile.findOne({ userId: application.applicantUserId }).select('userId fullName headline bio location skills experience education').lean() as ApplicantProfileSummary | null;
    return this.detail(application, job, profile ?? undefined);
  }

  public async transition(employerUserId: string, applicationId: string, target: EmployerApplicationStatus) {
    const { application, job, company } = await this.ownedApplication(employerUserId, applicationId);
    const currentStatus = application.status as ApplicantVisibleApplicationStatus;
    if (!canEmployerTransition(currentStatus, target)) {
      throw new AppError({ statusCode: 409, code: 'APPLICATION_INVALID_TRANSITION', message: 'Application cannot transition to the requested status' });
    }
    const updated = await Application.findOneAndUpdate(
      { _id: application._id, companyId: company._id, status: currentStatus },
      { $set: { status: target } },
      { returnDocument: 'after', runValidators: true },
    ).lean();
    if (!updated) {
      const current = await Application.exists({ _id: application._id, companyId: company._id, status: { $in: applicantVisibleApplicationStatuses } });
      if (!current) throw new AppError({ statusCode: 404, code: 'APPLICATION_NOT_FOUND', message: 'Application not found' });
      throw new AppError({ statusCode: 409, code: 'APPLICATION_STATUS_CONFLICT', message: 'Application status changed before the update could be applied' });
    }
    this.logger.info({ event: 'application_status_updated', applicationId, status: target }, 'Application status updated');
    const profile = await ApplicantProfile.findOne({ userId: updated.applicantUserId }).select('userId fullName headline bio location skills experience education').lean() as ApplicantProfileSummary | null;
    return this.detail(updated, job, profile ?? undefined);
  }

  public async createSnapshotAccess(employerUserId: string, applicationId: string) {
    const { application } = await this.ownedApplication(employerUserId, applicationId);
    if (!application.resumeSnapshot) throw new AppError({ statusCode: 404, code: 'RESUME_NOT_FOUND', message: 'Application resume snapshot not found' });
    const expiresAt = new Date(Date.now() + 5 * 60 * 1_000);
    try {
      const accessUrl = await this.storage.createAccessUrl({ assetId: application.resumeSnapshot.assetId, expiresAt });
      this.logger.info({ event: 'application_resume_access_granted', applicationId }, 'Application resume snapshot access granted');
      return { accessUrl, expiresAt };
    } catch {
      this.logger.error({ event: 'application_resume_access_failed', applicationId }, 'Application resume snapshot access failed');
      throw new AppError({ statusCode: 503, code: 'RESUME_SNAPSHOT_ERROR', message: 'Resume snapshot storage is temporarily unavailable' });
    }
  }

  private async ownedCompany(employerUserId: string) {
    const company = await Company.findOne({ ownerUserId: employerUserId }).lean();
    if (!company) throw new AppError({ statusCode: 409, code: 'COMPANY_REQUIRED', message: 'Create a company before reviewing applications' });
    return company;
  }

  private async ownedApplication(employerUserId: string, applicationId: string) {
    const company = await this.ownedCompany(employerUserId);
    const application = await Application.findOne({ _id: applicationId, companyId: company._id, status: { $in: applicantVisibleApplicationStatuses } }).lean();
    if (!application) throw new AppError({ statusCode: 404, code: 'APPLICATION_NOT_FOUND', message: 'Application not found' });
    const job = await Job.findOne({ _id: application.jobId, companyId: company._id }).select('_id title slug').lean();
    if (!job) throw new AppError({ statusCode: 404, code: 'APPLICATION_NOT_FOUND', message: 'Application not found' });
    return { company, application, job };
  }

  private async profilesFor(applications: PersistedApplication[]) {
    const profiles = await ApplicantProfile.find({ userId: { $in: applications.map((application) => application.applicantUserId) } }).select('userId fullName headline location skills').lean() as ApplicantProfileSummary[];
    return new Map(profiles.map((profile) => [profile.userId.toString(), profile]));
  }

  private listItem(application: PersistedApplication, profiles: Map<string, ApplicantProfileSummary>) {
    return {
      id: application._id.toString(), status: application.status as ApplicantVisibleApplicationStatus, appliedAt: application.appliedAt.toISOString(), updatedAt: application.updatedAt.toISOString(),
      applicant: candidateSummary(profiles.get(application.applicantUserId.toString())), resumeSnapshot: safeSnapshot(application.resumeSnapshot!),
    };
  }

  private detail(application: PersistedApplication, job: { _id: { toString(): string }; title: string; slug: string }, profile: ApplicantProfileSummary | undefined) {
    return {
      id: application._id.toString(), status: application.status as ApplicantVisibleApplicationStatus, appliedAt: application.appliedAt.toISOString(), updatedAt: application.updatedAt.toISOString(),
      ...(application.withdrawnAt ? { withdrawnAt: application.withdrawnAt.toISOString() } : {}), ...(application.coverLetter ? { coverLetter: application.coverLetter } : {}),
      applicant: candidateDetail(profile), job: { id: job._id.toString(), title: job.title, slug: job.slug }, resumeSnapshot: safeSnapshot(application.resumeSnapshot!),
    };
  }
}
