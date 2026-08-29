import { z } from 'zod';
import { employmentTypes, jobStatuses, salaryPeriods, workModes } from '../models/job.js';
import { locationInput } from '../profiles/validation.js';

const text = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const boundedItems = (maximumItems: number, maximumLength: number) => z.array(text(1, maximumLength)).max(maximumItems);
const uniqueSkills = boundedItems(30, 50).transform((items) => items.filter((item, index) => items.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index));

export const jobSalarySchema = z.object({
  min: z.number().finite().nonnegative().optional(),
  max: z.number().finite().nonnegative().optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency must be a three-letter ISO-style code'),
  period: z.enum(salaryPeriods),
  visible: z.boolean(),
}).strict().superRefine((salary, context) => {
  if (salary.min === undefined && salary.max === undefined) context.addIssue({ code: 'custom', message: 'Salary must include a minimum or maximum', path: ['min'] });
  if (salary.min !== undefined && salary.max !== undefined && salary.min > salary.max) context.addIssue({ code: 'custom', message: 'Minimum salary must not exceed maximum salary', path: ['min'] });
});

export const jobCreateSchema = z.object({
  title: text(2, 160),
  description: text(20, 10_000),
  requirements: boundedItems(30, 500).default([]),
  skills: uniqueSkills.default([]),
  location: locationInput,
  workMode: z.enum(workModes),
  employmentType: z.enum(employmentTypes),
  salary: jobSalarySchema.optional(),
  applicationDeadline: z.coerce.date().optional(),
}).strict();

export const jobPatchSchema = jobCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const employerJobListSchema = z.object({
  status: z.enum(jobStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
}).strict();

export type JobCreateInput = z.infer<typeof jobCreateSchema>;
export type JobPatchInput = z.infer<typeof jobPatchSchema>;
