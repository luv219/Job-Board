import { Schema, model, type Types } from 'mongoose';

export interface SavedJobRecord {
  applicantUserId: Types.ObjectId;
  jobId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<SavedJobRecord>({
  applicantUserId: { type: Schema.Types.ObjectId, required: true },
  jobId: { type: Schema.Types.ObjectId, required: true },
}, { timestamps: true, strict: 'throw' });

schema.index({ applicantUserId: 1, jobId: 1 }, { unique: true });
schema.index({ applicantUserId: 1, createdAt: -1 });

export const SavedJob = model<SavedJobRecord>('SavedJob', schema);
