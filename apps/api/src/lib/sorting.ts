import { AppError } from './app-error.js';

export type SortDirection = 1 | -1;

export function parseSort(value: unknown, allowedFields: readonly string[]): { field: string; direction: SortDirection } | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'Sort parameter is invalid' });
  }

  const direction: SortDirection = value.startsWith('-') ? -1 : 1;
  const field = direction === -1 ? value.slice(1) : value;
  if (!allowedFields.includes(field)) {
    throw new AppError({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'Sort field is not supported' });
  }
  return { field, direction };
}
