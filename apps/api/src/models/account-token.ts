import { Schema, model, type Types } from 'mongoose';

export const accountTokenPurposes = ['EMAIL_VERIFICATION', 'PASSWORD_RESET'] as const;
export type AccountTokenPurpose = (typeof accountTokenPurposes)[number];

export interface AccountTokenRecord {
  userId: Types.ObjectId;
  purpose: AccountTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<AccountTokenRecord>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  purpose: { type: String, required: true, enum: accountTokenPurposes },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ userId: 1, purpose: 1 }, { unique: true, partialFilterExpression: { consumedAt: null } });

export const AccountToken = model<AccountTokenRecord>('AccountToken', schema);
