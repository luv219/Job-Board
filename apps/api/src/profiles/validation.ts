import { z } from 'zod';
import { companySizes } from '../models/company.js';

const text = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).optional();
const date = z.coerce.date();
export const locationInput = z.object({ city: text(1, 80), state: optionalText(80), country: text(1, 80) }).strict();
const experience = z.object({ title: text(1, 120), companyName: text(1, 160), location: optionalText(160), startDate: date, endDate: date.optional(), isCurrent: z.boolean(), description: optionalText(2_000) }).strict().superRefine((entry, context) => {
  if (entry.endDate && entry.startDate > entry.endDate) context.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must not be before start date' });
  if (entry.isCurrent && entry.endDate) context.addIssue({ code: 'custom', path: ['endDate'], message: 'Current experience must not include an end date' });
});
const education = z.object({ institution: text(1, 160), degree: text(1, 120), fieldOfStudy: optionalText(120), startDate: date.optional(), endDate: date.optional(), description: optionalText(2_000) }).strict().superRefine((entry, context) => {
  if (entry.startDate && entry.endDate && entry.startDate > entry.endDate) context.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must not be before start date' });
});
const skills = z.array(text(1, 50)).max(30).transform((items) => items.filter((item, index) => items.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index));

export const applicantCreateSchema = z.object({ fullName: text(2, 120), headline: optionalText(160), bio: optionalText(5_000), location: locationInput, skills: skills.default([]), experience: z.array(experience).max(20).default([]), education: z.array(education).max(15).default([]) }).strict();
export const applicantPatchSchema = applicantCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const employerCreateSchema = z.object({ fullName: text(2, 120), jobTitle: optionalText(120), phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/).optional() }).strict();
export const employerPatchSchema = employerCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const companyCreateSchema = z.object({ name: text(2, 160), description: optionalText(5_000), website: z.string().trim().url().refine((value) => /^https?:\/\//i.test(value), 'Website must use HTTP or HTTPS').optional(), industry: optionalText(100), companySize: z.enum(companySizes).optional(), location: locationInput }).strict();
export const companyPatchSchema = companyCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');
