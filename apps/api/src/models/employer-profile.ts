import { Schema, model, type Types } from 'mongoose';
export interface EmployerProfileRecord { userId: Types.ObjectId; fullName: string; jobTitle?: string; phone?: string; createdAt: Date; updatedAt: Date; }
const schema = new Schema<EmployerProfileRecord>({ userId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true }, fullName: { type: String, required: true }, jobTitle: String, phone: String }, { timestamps: true, strict: 'throw' });
export const EmployerProfile = model<EmployerProfileRecord>('EmployerProfile', schema);
