import { Schema, model, type Types } from 'mongoose';

export interface AuthSessionRecord {
  userId: Types.ObjectId;
  tokenHash: string;
  previousTokenHash?: string;
  expiresAt: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const authSessionSchema = new Schema<AuthSessionRecord>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  previousTokenHash: { type: String, select: false, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  lastUsedAt: { type: Date },
}, { timestamps: true, strict: 'throw' });

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSession = model<AuthSessionRecord>('AuthSession', authSessionSchema);
