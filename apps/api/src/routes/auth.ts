import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Environment } from '../config/env.js';
import { AppError } from '../lib/app-error.js';
import { validate } from '../validation/validate.js';
import { clearRefreshCookie, getRefreshCookie, setRefreshCookie } from '../auth/cookies.js';
import { login, logout, refresh, register, toPublicUser } from '../auth/auth-service.js';
import { userRoles, User } from '../models/user.js';
import { requireAuth } from '../middleware/auth.js';

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(12).max(128);
const registerSchema = z.object({ email: emailSchema, password: passwordSchema, role: z.enum(userRoles) }).strict();
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();

function authLimiter() {
  return rateLimit({
    windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_request, _response, next) => next(new AppError({ statusCode: 429, code: 'TOO_MANY_REQUESTS', message: 'Too many authentication requests. Please try again later.' })),
  });
}

export function createAuthRouter(environment: Environment): Router {
  const router = Router();
  router.post('/register', authLimiter(), validate('body', registerSchema), async (request, response, next) => {
    try {
      const issued = await register(request.body as z.infer<typeof registerSchema>, environment);
      setRefreshCookie(response, issued.refreshToken, environment);
      response.status(201).json(issued.response);
    } catch (error) { next(error); }
  });
  router.post('/login', authLimiter(), validate('body', loginSchema), async (request, response, next) => {
    try {
      const issued = await login(request.body as z.infer<typeof loginSchema>, environment);
      setRefreshCookie(response, issued.refreshToken, environment);
      response.status(200).json(issued.response);
    } catch (error) { next(error); }
  });
  router.post('/refresh', authLimiter(), async (request, response, next) => {
    try {
      const token = getRefreshCookie(request.cookies as Record<string, unknown>);
      if (!token) throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required' });
      const issued = await refresh(token, environment);
      setRefreshCookie(response, issued.refreshToken, environment);
      response.status(200).json(issued.response);
    } catch (error) { next(error); }
  });
  router.post('/logout', async (request, response, next) => {
    try {
      await logout(getRefreshCookie(request.cookies as Record<string, unknown>));
      clearRefreshCookie(response, environment);
      response.status(204).send();
    } catch (error) { next(error); }
  });
  router.get('/me', requireAuth(environment), async (request, response, next) => {
    try {
      const user = await User.findById(request.principal?.id).lean();
      if (!user) throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required' });
      response.status(200).json({ user: toPublicUser(user) });
    } catch (error) { next(error); }
  });
  return router;
}
