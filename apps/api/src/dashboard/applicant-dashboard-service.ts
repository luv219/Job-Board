import type { Logger } from 'pino';
import { Types } from 'mongoose';
import { ApplicantProfile } from '../models/applicant-profile.js';
import { Application, applicantVisibleApplicationStatuses, type ApplicantVisibleApplicationStatus, type ApplicationRecord } from '../models/application.js';
import { Company, type CompanyRecord } from '../models/company.js';
import { Job, type JobRecord } from '../models/job.js';
import { SavedJob } from '../models/saved-job.js';
import { SavedJobService } from '../saved-jobs/saved-job-service.js';

type WithId<T> = T & { _id: { toString(): string } };
type ApplicationWithId = WithId<ApplicationRecord>;

function emptyStatusCounts(): Record<ApplicantVisibleApplicationStatus, number> {
  return Object.fromEntries(applicantVisibleApplicationStatuses.map((status) => [status, 0])) as Record<ApplicantVisibleApplicationStatus, number>;
}

export class ApplicantDashboardService {
  public constructor(private readonly logger: Logger) {}

  public async get(applicantUserId: string) {
    const applicationFilter = { applicantUserId, status: { $in: applicantVisibleApplicationStatuses } };
    const [profile, applicationTotal, statusCounts, recentApplications, savedJobTotal, recentSavedJobs] = await Promise.all([
      ApplicantProfile.findOne({ userId: applicantUserId }).select('fullName headline location resume').lean(),
      Application.countDocuments(applicationFilter),
      Application.aggregate<{ _id: ApplicantVisibleApplicationStatus; count: number }>([
        { $match: { applicantUserId: new Types.ObjectId(applicantUserId), status: { $in: applicantVisibleApplicationStatuses } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Application.find(applicationFilter).sort({ appliedAt: -1, _id: -1 }).limit(5).lean(),
      SavedJob.countDocuments({ applicantUserId }),
      new SavedJobService(this.logger).recent(applicantUserId),
    ]);
    const counts = emptyStatusCounts();
    for (const item of statusCounts) counts[item._id] = item.count;
    return {
      profile: profile ? { exists: true, fullName: profile.fullName, ...(profile.headline ? { headline: profile.headline } : {}), location: profile.location } : { exists: false },
      resume: profile?.resume ? { exists: true, originalFilename: profile.resume.originalFilename, uploadedAt: profile.resume.uploadedAt.toISOString() } : { exists: false },
      applications: { total: applicationTotal, byStatus: counts, recent: await this.recentApplications(recentApplications) },
      savedJobs: { total: savedJobTotal, recent: recentSavedJobs },
    };
  }

  private async recentApplications(applications: ApplicationWithId[]) {
    const jobs = await Job.find({ _id: { $in: applications.map((application) => application.jobId) } }).select('_id companyId slug title').lean() as WithId<Pick<JobRecord, 'companyId' | 'slug' | 'title'>>[];
    const companies = await Company.find({ _id: { $in: jobs.map((job) => job.companyId) } }).select('_id name slug').lean() as WithId<Pick<CompanyRecord, 'name' | 'slug'>>[];
    const jobsById = new Map(jobs.map((job) => [job._id.toString(), job]));
    const companiesById = new Map(companies.map((company) => [company._id.toString(), company]));
    return applications.map((application) => {
      const job = jobsById.get(application.jobId.toString());
      const company = job ? companiesById.get(job.companyId.toString()) : undefined;
      return {
        id: application._id.toString(), status: application.status as ApplicantVisibleApplicationStatus, appliedAt: application.appliedAt.toISOString(),
        job: job && company ? { id: job._id.toString(), slug: job.slug, title: job.title, company: { name: company.name, slug: company.slug } } : null,
      };
    });
  }
}
