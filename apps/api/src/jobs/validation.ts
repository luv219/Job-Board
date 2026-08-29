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

const queryText = (maximum: number) => z.string().trim().min(1).max(maximum);
const commaSeparatedValues = (maximumItems: number, maximumLength: number) => z.string().transform((value, context) => {
  const values = value.split(',').map((item) => item.trim());
  if (values.some((item) => item.length === 0)) {
    context.addIssue({ code: 'custom', message: 'Values must not be blank' });
    return z.NEVER;
  }
  return values;
}).pipe(z.array(z.string().min(1).max(maximumLength)).min(1).max(maximumItems)).transform((values) => values.filter((value, index) => values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index));

const queryNumber = z.string().regex(/^\d+(?:\.\d+)?$/, 'Must be a non-negative decimal number').transform(Number).refine(Number.isFinite, 'Must be finite');

export const publicJobSearchSchema = z.object({
  q: queryText(100).optional(),
  city: queryText(80).optional(),
  state: queryText(80).optional(),
  country: queryText(80).optional(),
  workMode: z.enum(workModes).optional(),
  employmentType: z.enum(employmentTypes).optional(),
  skills: commaSeparatedValues(10, 50).optional(),
  salaryMin: queryNumber.optional(),
  salaryMax: queryNumber.optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  salaryPeriod: z.enum(salaryPeriods).optional(),
  company: queryText(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Company must be a slug').optional(),
  postedWithin: z.enum(['24h', '7d', '30d']).optional(),
  sort: z.enum(['newest', 'oldest', 'relevance']).optional(),
  page: z.string().regex(/^\d+$/, 'Must be a positive integer').transform(Number).pipe(z.number().int().min(1)).default(1),
  limit: z.string().regex(/^\d+$/, 'Must be a positive integer').transform(Number).pipe(z.number().int().min(1).max(100)).default(20),
}).strict().superRefine((query, context) => {
  const hasSalaryRange = query.salaryMin !== undefined || query.salaryMax !== undefined;
  if (query.salaryMin !== undefined && query.salaryMax !== undefined && query.salaryMin > query.salaryMax) context.addIssue({ code: 'custom', path: ['salaryMin'], message: 'salaryMin must not exceed salaryMax' });
  if (hasSalaryRange && !query.currency) context.addIssue({ code: 'custom', path: ['currency'], message: 'Currency is required with salary filters' });
  if (hasSalaryRange && !query.salaryPeriod) context.addIssue({ code: 'custom', path: ['salaryPeriod'], message: 'Salary period is required with salary filters' });
  if (query.sort === 'relevance' && !query.q) context.addIssue({ code: 'custom', path: ['sort'], message: 'Relevance sorting requires q' });
});

export type JobCreateInput = z.infer<typeof jobCreateSchema>;
export type JobPatchInput = z.infer<typeof jobPatchSchema>;
export type PublicJobSearchQuery = z.infer<typeof publicJobSearchSchema>;
