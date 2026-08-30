import { Schema, model, type Types } from 'mongoose';

export interface CompanyInvitationRecord { companyId: Types.ObjectId; invitedEmail: string; role: 'RECRUITER'; tokenHash: string; invitedByUserId: Types.ObjectId; expiresAt: Date; acceptedAt?: Date; revokedAt?: Date; createdAt: Date; updatedAt: Date; }
const schema = new Schema<CompanyInvitationRecord>({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true },
  invitedEmail: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, required: true, enum: ['RECRUITER'], default: 'RECRUITER' },
  tokenHash: { type: String, required: true, unique: true },
  invitedByUserId: { type: Schema.Types.ObjectId, required: true },
  expiresAt: { type: Date, required: true }, acceptedAt: Date, revokedAt: Date,
}, { timestamps: true, strict: 'throw' });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ companyId: 1, invitedEmail: 1 });
export const CompanyInvitation = model<CompanyInvitationRecord>('CompanyInvitation', schema);
