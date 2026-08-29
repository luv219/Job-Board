import { Schema, model, type Types } from 'mongoose';
export const companySizes = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'] as const;
export interface CompanyRecord { ownerUserId: Types.ObjectId; name: string; slug: string; description?: string; website?: string; industry?: string; companySize?: (typeof companySizes)[number]; location: { city: string; state?: string; country: string }; createdAt: Date; updatedAt: Date; }
const locationSchema = new Schema({ city: String, state: String, country: String }, { _id: false });
const schema = new Schema<CompanyRecord>({
  ownerUserId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true }, name: { type: String, required: true }, slug: { type: String, required: true, unique: true, index: true }, description: String, website: String, industry: String,
  companySize: { type: String, enum: companySizes }, location: { type: locationSchema, required: true },
}, { timestamps: true, strict: 'throw' });
export const Company = model<CompanyRecord>('Company', schema);
