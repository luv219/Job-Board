import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@job-board/contracts';
import { User } from '../models/user.js';
import type { Environment } from '../config/env.js';
import { AppError } from '../lib/app-error.js';
import { isValidObjectId } from '../lib/object-id.js';
import { verifyAccessToken } from '../auth/tokens.js';

export function requireAuth(environment: Environment) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      const token = /^Bearer ([A-Za-z0-9._-]+)$/.exec(request.header('authorization') ?? '')?.[1];
      if (!token) throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required' });
      const claims = await verifyAccessToken(token, environment);
      if (!isValidObjectId(claims.userId)) throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required' });
      const user = await User.findById(claims.userId).lean();
      if (!user || user.accountStatus !== 'ACTIVE') throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required' });
      request.principal = { id: user._id.toString(), role: user.role };
      next();
    } catch (error) { next(error); }
  };
}

export function requireRole(...roles: UserRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.principal) { next(new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required' })); return; }
    if (!roles.includes(request.principal.role)) { next(new AppError({ statusCode: 403, code: 'FORBIDDEN', message: 'You do not have permission to perform this action' })); return; }
    next();
  };
}
