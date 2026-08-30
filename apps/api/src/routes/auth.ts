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
import { AccountRecoveryService } from '../auth/account-recovery-service.js';
import { EmailNotificationService } from '../notifications/email-notification-service.js';

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(12).max(128);
const registerSchema = z.object({ email: emailSchema, password: passwordSchema, role: z.enum(userRoles) }).strict();
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
const oneTimeTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Token is invalid');
const verificationConfirmSchema = z.object({ token: oneTimeTokenSchema }).strict();
const passwordResetRequestSchema = z.object({ email: emailSchema }).strict();
const passwordResetConfirmSchema = z.object({ token: oneTimeTokenSchema, newPassword: passwordSchema }).strict();

function authLimiter() {
  return rateLimit({
    windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_request, _response, next) => next(new AppError({ statusCode: 429, code: 'TOO_MANY_REQUESTS', message: 'Too many authentication requests. Please try again later.' })),
  });
}

function securityEmailLimiter(limit: number) {
  return rateLimit({
    windowMs: 15 * 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_request, _response, next) => next(new AppError({ statusCode: 429, code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please try again later.' })),
  });
}

export function createAuthRouter(environment: Environment, notifications: EmailNotificationService): Router {
  const router = Router();
  router.post('/register', authLimiter(), validate('body', registerSchema), async (request, response, next) => {
    try {
      const issued = await register(request.body as z.infer<typeof registerSchema>, environment);
      try { await new AccountRecoveryService(notifications, request.log).requestVerification(issued.response.user.id); }
      catch { request.log.warn({ event: 'registration_verification_email_unavailable', userId: issued.response.user.id }, 'Registration verification email unavailable'); }
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
  router.post('/email-verification/request', requireAuth(environment), securityEmailLimiter(5), async (request, response, next) => {
    try { await new AccountRecoveryService(notifications, request.log).requestVerification(request.principal!.id); response.status(204).send(); }
    catch (error) { next(error); }
  });
  router.post('/email-verification/confirm', securityEmailLimiter(10), validate('body', verificationConfirmSchema), async (request, response, next) => {
    try { await new AccountRecoveryService(notifications, request.log).confirmVerification((request.body as z.infer<typeof verificationConfirmSchema>).token); response.status(204).send(); }
    catch (error) { next(error); }
  });
  router.post('/password-reset/request', securityEmailLimiter(5), validate('body', passwordResetRequestSchema), async (request, response, next) => {
    try { await new AccountRecoveryService(notifications, request.log).requestPasswordReset((request.body as z.infer<typeof passwordResetRequestSchema>).email); response.status(202).json({ message: 'If an account exists for that email, a reset link has been sent.' }); }
    catch (error) { next(error); }
  });
  router.post('/password-reset/confirm', securityEmailLimiter(10), validate('body', passwordResetConfirmSchema), async (request, response, next) => {
    try { await new AccountRecoveryService(notifications, request.log).confirmPasswordReset((request.body as z.infer<typeof passwordResetConfirmSchema>).token, (request.body as z.infer<typeof passwordResetConfirmSchema>).newPassword); response.status(204).send(); }
    catch (error) { next(error); }
  });
  return router;
}
