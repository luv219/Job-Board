import type { ApplicantVisibleApplicationStatus } from '../models/application.js';

export const employerApplicationStatuses = ['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'] as const;
export type EmployerApplicationStatus = (typeof employerApplicationStatuses)[number];

const employerTransitions: Record<ApplicantVisibleApplicationStatus, readonly EmployerApplicationStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'SHORTLISTED', 'REJECTED'],
  UNDER_REVIEW: ['SHORTLISTED', 'REJECTED'],
  SHORTLISTED: ['INTERVIEW', 'REJECTED'],
  INTERVIEW: ['OFFER', 'REJECTED'],
  OFFER: ['HIRED', 'REJECTED'],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function canEmployerTransition(from: ApplicantVisibleApplicationStatus, to: EmployerApplicationStatus): boolean {
  return employerTransitions[from].includes(to);
}

export function canApplicantWithdraw(status: ApplicantVisibleApplicationStatus): boolean {
  return !['HIRED', 'REJECTED', 'WITHDRAWN'].includes(status);
}
