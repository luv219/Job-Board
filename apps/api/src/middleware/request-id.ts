import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestId(request: Request, response: Response, next: NextFunction): void {
  const suppliedId = request.header('x-request-id');
  const id = suppliedId && /^[a-zA-Z0-9_-]{1,128}$/.test(suppliedId) ? suppliedId : randomUUID();
  request.id = id;
  response.setHeader('x-request-id', id);
  next();
}
