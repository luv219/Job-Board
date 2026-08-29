import type mongoose from 'mongoose';
import type { JobRecord } from '../models/job.js';

export function publicActiveJobFilter(now: Date): mongoose.QueryFilter<JobRecord> {
  return {
    status: 'PUBLISHED',
    $or: [
      { applicationDeadline: { $exists: false } },
      { applicationDeadline: { $gte: now } },
    ],
  };
}
