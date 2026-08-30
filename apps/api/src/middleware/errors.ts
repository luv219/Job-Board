import type { NextFunction, Request, Response } from 'express';
import { apiErrorResponseSchema } from '@job-board/contracts';
import type { Environment } from '../config/env.js';
import { AppError } from '../lib/app-error.js';
import { normalizedRoute } from './observability.js';

export function notFoundHandler(request: Request, response: Response): void {
  response.status(404).json(apiErrorResponseSchema.parse({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: request.id } }));
}

export function errorHandler(environment: Pick<Environment, 'NODE_ENV'>) {
  return (error: unknown, request: Request, response: Response, _next: NextFunction): void => {
    void _next;
    const appError = error instanceof AppError ? error : undefined;
    const status = appError?.statusCode ?? (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500 ? error.status : 500);
    const code = appError?.code ?? (status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    const message = appError?.message ?? (status === 500 ? 'Internal server error' : 'Invalid request');
    if (status >= 500) {
      request.log.error({
        event: 'request_error', requestId: request.id, method: request.method, route: normalizedRoute(request), statusCode: status,
        errorCode: code, errorName: error instanceof Error ? error.name : 'UnknownError',
        ...(environment.NODE_ENV !== 'production' && error instanceof Error ? { errorStack: error.stack } : {}),
      }, 'Unexpected request error');
    }
    response.status(status).json(apiErrorResponseSchema.parse({
      error: {
        code,
        message: environment.NODE_ENV === 'production' ? (status === 500 ? 'Internal server error' : 'Invalid request') : message,
        requestId: request.id,
        ...(appError?.details ? { details: appError.details } : {}),
      },
    }));
  };
}
