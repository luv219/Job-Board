import type { NextFunction, Request, Response } from 'express';
import type { Environment } from '../config/env.js';

export function notFoundHandler(request: Request, response: Response): void {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: request.id } });
}

export function errorHandler(environment: Pick<Environment, 'NODE_ENV'>) {
  return (error: unknown, request: Request, response: Response, _next: NextFunction): void => {
    void _next;
    request.log.error({ err: error }, 'Unhandled request error');
    const detail = error instanceof Error ? error.message : 'Unexpected error';
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
    response.status(status).json({
      error: {
        code: status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
        message: environment.NODE_ENV === 'production' ? (status === 500 ? 'Internal server error' : 'Invalid request') : detail,
        requestId: request.id,
      },
    });
  };
}
