import { randomBytes } from 'node:crypto';
import type { JobRecord } from '../models/job.js';
import { slugify } from '../profiles/slug.js';

export type JobAction = 'publish' | 'close' | 'archive';

const allowedTransitions: Record<JobAction, readonly JobRecord['status'][]> = {
  publish: ['DRAFT'],
  close: ['PUBLISHED'],
  archive: ['DRAFT', 'CLOSED'],
};

export function canTransition(status: JobRecord['status'], action: JobAction): boolean {
  return allowedTransitions[action].includes(status);
}

export function canEditJob(status: JobRecord['status']): boolean {
  return status === 'DRAFT' || status === 'PUBLISHED';
}

export function createJobSlug(title: string, suffix = randomBytes(4).toString('hex')): string {
  return `${slugify(title)}-${suffix}`;
}

export function isPublishable(job: Pick<JobRecord, 'title' | 'description' | 'location' | 'workMode' | 'employmentType' | 'applicationDeadline'>, now = new Date()): boolean {
  return Boolean(job.title && job.description && job.location && job.workMode && job.employmentType) && (!job.applicationDeadline || job.applicationDeadline >= now);
}
