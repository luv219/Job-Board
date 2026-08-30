import { Schema, model, type Types } from 'mongoose';

export const applicationStatuses = ['CREATING', 'SUBMITTED', 'WITHDRAWN'] as const;
export type ApplicantVisibleApplicationStatus = Exclude<(typeof applicationStatuses)[number], 'CREATING'>;

export interface ApplicationRecord {
  jobId: Types.ObjectId;
  companyId: Types.ObjectId;
  applicantUserId: Types.ObjectId;
  resumeSnapshot?: { provider: 'cloudinary'; assetId: string; originalFilename: string; mimeType: 'application/pdf'; sizeBytes: number; capturedAt: Date };
  coverLetter?: string;
  status: (typeof applicationStatuses)[number];
  appliedAt: Date;
  withdrawnAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const resumeSnapshotSchema = new Schema({
  provider: { type: String, required: true, enum: ['cloudinary'] },
  assetId: { type: String, required: true },
  originalFilename: { type: String, required: true },
  mimeType: { type: String, required: true, enum: ['application/pdf'] },
  sizeBytes: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024 },
  capturedAt: { type: Date, required: true },
}, { _id: false });

const schema = new Schema<ApplicationRecord>({
  jobId: { type: Schema.Types.ObjectId, required: true, index: true },
  companyId: { type: Schema.Types.ObjectId, required: true, index: true },
  applicantUserId: { type: Schema.Types.ObjectId, required: true, index: true },
  resumeSnapshot: { type: resumeSnapshotSchema, required: function (this: Pick<ApplicationRecord, 'status'>) { return this.status !== 'CREATING'; } },
  coverLetter: { type: String, maxlength: 5_000 },
  status: { type: String, required: true, enum: applicationStatuses, default: 'CREATING' },
  appliedAt: { type: Date, required: true },
  withdrawnAt: Date,
}, { timestamps: true, strict: 'throw' });

schema.index({ jobId: 1, applicantUserId: 1 }, { unique: true });
schema.index({ applicantUserId: 1, appliedAt: -1 });
schema.index({ applicantUserId: 1, status: 1, appliedAt: -1 });

export const Application = model<ApplicationRecord>('Application', schema);
