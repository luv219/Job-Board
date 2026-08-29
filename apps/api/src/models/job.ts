import { Schema, model, type Types } from 'mongoose';

export const jobStatuses = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'] as const;
export const employmentTypes = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY'] as const;
export const workModes = ['ONSITE', 'HYBRID', 'REMOTE'] as const;
export const salaryPeriods = ['YEAR', 'MONTH', 'HOUR'] as const;

export interface JobRecord {
  companyId: Types.ObjectId;
  createdBy: Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  requirements: string[];
  skills: string[];
  location: { city: string; state?: string | undefined; country: string };
  workMode: (typeof workModes)[number];
  employmentType: (typeof employmentTypes)[number];
  salary?: { min?: number | undefined; max?: number | undefined; currency: string; period: (typeof salaryPeriods)[number]; visible: boolean };
  status: (typeof jobStatuses)[number];
  applicationDeadline?: Date;
  publishedAt?: Date;
  closedAt?: Date;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const locationSchema = new Schema({ city: String, state: String, country: String }, { _id: false });
const salarySchema = new Schema({
  min: { type: Number, min: 0 }, max: { type: Number, min: 0 },
  currency: { type: String, match: /^[A-Z]{3}$/ }, period: { type: String, enum: salaryPeriods, required: true }, visible: { type: Boolean, required: true },
}, { _id: false });

const schema = new Schema<JobRecord>({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, required: true, index: true },
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true, index: true },
  description: { type: String, required: true },
  requirements: { type: [String], required: true, default: [] },
  skills: { type: [String], required: true, default: [] },
  location: { type: locationSchema, required: true },
  workMode: { type: String, enum: workModes, required: true },
  employmentType: { type: String, enum: employmentTypes, required: true },
  salary: salarySchema,
  status: { type: String, enum: jobStatuses, required: true, default: 'DRAFT' },
  applicationDeadline: Date,
  publishedAt: Date,
  closedAt: Date,
  archivedAt: Date,
}, { timestamps: true, strict: 'throw' });

schema.index({ companyId: 1, status: 1, createdAt: -1 });
schema.index({ status: 1, publishedAt: -1 });
schema.index({ companyId: 1, status: 1, publishedAt: -1 });
schema.index({ title: 'text', skills: 'text', description: 'text', requirements: 'text' }, { name: 'job_public_text', weights: { title: 10, skills: 6, requirements: 3, description: 1 } });

export const Job = model<JobRecord>('Job', schema);
