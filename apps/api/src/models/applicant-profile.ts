import { Schema, model, type Types } from 'mongoose';

export interface ApplicantProfileRecord {
  userId: Types.ObjectId; fullName: string; headline?: string; bio?: string;
  location: { city: string; state?: string; country: string }; skills: string[];
  experience: Array<{ title: string; companyName: string; location?: string; startDate: Date; endDate?: Date; isCurrent: boolean; description?: string }>;
  education: Array<{ institution: string; degree: string; fieldOfStudy?: string; startDate?: Date; endDate?: Date; description?: string }>;
  createdAt: Date; updatedAt: Date;
}

const locationSchema = new Schema({ city: String, state: String, country: String }, { _id: false });
const experienceSchema = new Schema({ title: String, companyName: String, location: String, startDate: Date, endDate: Date, isCurrent: Boolean, description: String }, { _id: false });
const educationSchema = new Schema({ institution: String, degree: String, fieldOfStudy: String, startDate: Date, endDate: Date, description: String }, { _id: false });
const schema = new Schema<ApplicantProfileRecord>({
  userId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true }, fullName: { type: String, required: true }, headline: String, bio: String,
  location: { type: locationSchema, required: true }, skills: { type: [String], default: [] }, experience: { type: [experienceSchema], default: [] }, education: { type: [educationSchema], default: [] },
}, { timestamps: true, strict: 'throw' });
export const ApplicantProfile = model<ApplicantProfileRecord>('ApplicantProfile', schema);
