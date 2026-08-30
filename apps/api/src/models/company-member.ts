import { Schema, model, type Types } from 'mongoose';
import type { CompanyRole } from '@job-board/contracts';

export const companyRoles = ['OWNER', 'RECRUITER'] as const satisfies readonly CompanyRole[];
export interface CompanyMemberRecord { companyId: Types.ObjectId; userId: Types.ObjectId; role: CompanyRole; joinedAt: Date; createdAt: Date; updatedAt: Date; }
const schema = new Schema<CompanyMemberRecord>({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  role: { type: String, required: true, enum: companyRoles },
  joinedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true, strict: 'throw' });
schema.index({ companyId: 1, userId: 1 }, { unique: true });
export const CompanyMember = model<CompanyMemberRecord>('CompanyMember', schema);
