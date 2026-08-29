import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import { AppError } from '../lib/app-error.js';

type RequestPart = 'body' | 'params' | 'query';

export function validate(part: RequestPart, schema: z.ZodType): (request: Request, response: Response, next: NextFunction) => void {
  return (request, _response, next) => {
    const result = schema.safeParse(request[part]);
    if (!result.success) {
      next(new AppError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: result.error.issues.map((issue) => ({ path: issue.path.join('.') || part, message: issue.message })),
      }));
      return;
    }

    if (part === 'query') {
      Object.assign(request.query, result.data);
    } else {
      request[part] = result.data;
    }
    next();
  };
}
