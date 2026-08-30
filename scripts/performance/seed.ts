import mongoose, { Types } from 'mongoose';
import { hashPassword } from '../../apps/api/src/auth/password.js';
import { Application } from '../../apps/api/src/models/application.js';
import { ApplicantProfile } from '../../apps/api/src/models/applicant-profile.js';
import { Company } from '../../apps/api/src/models/company.js';
import { EmployerProfile } from '../../apps/api/src/models/employer-profile.js';
import { Job } from '../../apps/api/src/models/job.js';
import { SavedJob } from '../../apps/api/src/models/saved-job.js';
import { User } from '../../apps/api/src/models/user.js';
import { assertSafePerformanceDatabase, requireSeedConfirmation } from './safety.js';

const defaults = { companies: 100, applicants: 200, jobs: 5_000, applications: 4_000, savedJobs: 2_000 } as const;
const maxCounts = { companies: 500, applicants: 2_000, jobs: 50_000, applications: 100_000, savedJobs: 100_000 } as const;

function count(name: keyof typeof defaults): number {
  const value = process.env[`PERF_${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`];
  if (!value) return defaults[name];
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maxCounts[name]) {
    throw new Error(`PERF_${name} must be an integer between 1 and ${maxCounts[name]}.`);
  }
  return parsed;
}

function oid(): Types.ObjectId { return new Types.ObjectId(); }
function title(index: number): string { return `Performance ${['Software Engineer', 'Product Designer', 'Data Analyst', 'Platform Engineer'][index % 4]} ${String(index).padStart(5, '0')}`; }

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is required.');
  assertSafePerformanceDatabase({ mongoUri, nodeEnv: process.env.NODE_ENV });
  requireSeedConfirmation(process.env.PERF_SEED_CONFIRM);

  const companiesCount = count('companies');
  const applicantsCount = count('applicants');
  const jobsCount = count('jobs');
  const applicationsCount = count('applications');
  const savedJobsCount = count('savedJobs');
  const now = new Date();
  const passwordHash = await hashPassword('synthetic-performance-password');

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000, autoIndex: false });
  try {
    await mongoose.connection.dropDatabase();
    const employerIds = Array.from({ length: companiesCount }, oid);
    const applicantIds = Array.from({ length: applicantsCount }, oid);
    await User.insertMany([
      ...employerIds.map((id, index) => ({ _id: id, email: `perf-employer-${index}@example.test`, passwordHash, role: 'EMPLOYER' as const, accountStatus: 'ACTIVE' as const, emailVerified: true })),
      ...applicantIds.map((id, index) => ({ _id: id, email: `perf-applicant-${index}@example.test`, passwordHash, role: 'APPLICANT' as const, accountStatus: 'ACTIVE' as const, emailVerified: true })),
    ], { ordered: true });
    await EmployerProfile.insertMany(employerIds.map((userId, index) => ({ userId, fullName: `Performance Employer ${index}`, jobTitle: 'Hiring Manager' })));
    await ApplicantProfile.insertMany(applicantIds.map((userId, index) => ({
      userId, fullName: `Performance Applicant ${index}`, headline: 'Synthetic benchmark profile', location: { city: 'Bengaluru', state: 'Karnataka', country: 'India' }, skills: ['TypeScript', 'React', 'MongoDB'], experience: [], education: [],
      resume: { provider: 'cloudinary' as const, assetId: `synthetic-perf-resume-${index}`, originalFilename: 'synthetic-resume.pdf', mimeType: 'application/pdf' as const, sizeBytes: 100_000, uploadedAt: now },
    })));
    const companies = employerIds.map((ownerUserId, index) => ({ _id: oid(), ownerUserId, name: `Performance Company ${index}`, slug: `performance-company-${index}`, description: 'Synthetic company record for local performance testing only.', industry: 'Technology', companySize: '51-200' as const, location: { city: 'Bengaluru', state: 'Karnataka', country: 'India' } }));
    await Company.insertMany(companies);
    const jobs = Array.from({ length: jobsCount }, (_, index) => {
      const company = companies[index % companies.length]!;
      const publishedAt = new Date(now.getTime() - (index % 180) * 86_400_000);
      return {
        _id: oid(), companyId: company._id, createdBy: company.ownerUserId, title: title(index), slug: `performance-job-${String(index).padStart(5, '0')}`,
        description: 'Synthetic public job description used only for safe local performance measurements.', requirements: ['Synthetic requirement'], skills: index % 2 === 0 ? ['TypeScript', 'React'] : ['MongoDB', 'Node.js'],
        location: { city: index % 3 === 0 ? 'Mumbai' : 'Bengaluru', state: index % 3 === 0 ? 'Maharashtra' : 'Karnataka', country: 'India' }, workMode: index % 3 === 0 ? 'HYBRID' as const : 'REMOTE' as const, employmentType: 'FULL_TIME' as const,
        salary: { min: 1_000_000, max: 2_000_000, currency: 'INR', period: 'YEAR' as const, visible: true }, status: 'PUBLISHED' as const, applicationDeadline: new Date(now.getTime() + 90 * 86_400_000), publishedAt,
      };
    });
    await Job.insertMany(jobs);
    await Application.insertMany(Array.from({ length: applicationsCount }, (_, index) => {
      const applicantUserId = applicantIds[index % applicantIds.length]!;
      const job = jobs[Math.floor(index / applicantIds.length) % jobs.length]!;
      return { jobId: job._id, companyId: job.companyId, applicantUserId, resumeSnapshot: { provider: 'cloudinary' as const, assetId: `synthetic-application-resume-${index}`, originalFilename: 'synthetic-resume.pdf', mimeType: 'application/pdf' as const, sizeBytes: 100_000, capturedAt: now }, coverLetter: 'Synthetic application for local performance testing.', status: 'SUBMITTED' as const, appliedAt: new Date(now.getTime() - (index % 30) * 86_400_000) };
    }));
    await SavedJob.insertMany(Array.from({ length: savedJobsCount }, (_, index) => ({ applicantUserId: applicantIds[index % applicantIds.length]!, jobId: jobs[Math.floor(index / applicantIds.length) % jobs.length]!._id })));
    await Promise.all([User, EmployerProfile, ApplicantProfile, Company, Job, Application, SavedJob].map((model) => model.syncIndexes()));
    const counts = await Promise.all([User.countDocuments(), Company.countDocuments(), Job.countDocuments(), Application.countDocuments(), SavedJob.countDocuments()]);
    console.log(JSON.stringify({ seeded: { users: counts[0], companies: counts[1], jobs: counts[2], applications: counts[3], savedJobs: counts[4] } }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Performance seed failed.');
  process.exitCode = 1;
});
