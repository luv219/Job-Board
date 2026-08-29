import { Schema, model } from 'mongoose';
import type { UserRole } from '@job-board/contracts';

export const userRoles = ['APPLICANT', 'EMPLOYER'] as const satisfies readonly UserRole[];
export const accountStatuses = ['ACTIVE', 'DISABLED'] as const;

export interface UserRecord {
  email: string;
  passwordHash: string;
  role: UserRole;
  accountStatus: (typeof accountStatuses)[number];
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserRecord>({
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: userRoles },
  accountStatus: { type: String, required: true, enum: accountStatuses, default: 'ACTIVE' },
  lastLoginAt: { type: Date },
}, { timestamps: true, strict: 'throw' });

export const User = model<UserRecord>('User', userSchema);
