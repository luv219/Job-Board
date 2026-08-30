import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/app-error.js';

const fifteenMinutes = 15 * 60_000;

function rejection(message: string) {
  return (_request: unknown, _response: unknown, next: (error: Error) => void): void => next(new AppError({ statusCode: 429, code: 'TOO_MANY_REQUESTS', message }));
}

export function publicRateLimit(limit: number, windowMs = fifteenMinutes): RequestHandler {
  return rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, handler: rejection('Too many requests. Please try again later.') });
}

export function principalRateLimit(limit: number, windowMs = fifteenMinutes): RequestHandler {
  return rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (request) => request.principal?.id ?? 'unauthenticated', handler: rejection('Too many requests. Please try again later.') });
}

export const privateNoStore: RequestHandler = (_request, response, next) => {
  response.set('Cache-Control', 'private, no-store');
  next();
};
