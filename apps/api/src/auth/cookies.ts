import type { CookieOptions, Response } from 'express';
import type { Environment } from '../config/env.js';

const refreshCookieName = 'refresh_token';

function options(environment: Environment): CookieOptions {
  return {
    httpOnly: true, secure: environment.NODE_ENV === 'production', sameSite: 'lax',
    path: '/api/v1/auth', maxAge: environment.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  };
}

export function setRefreshCookie(response: Response, token: string, environment: Environment): void {
  response.cookie(refreshCookieName, token, options(environment));
}

export function clearRefreshCookie(response: Response, environment: Environment): void {
  const clearOptions = options(environment);
  delete clearOptions.maxAge;
  response.clearCookie(refreshCookieName, clearOptions);
}

export function getRefreshCookie(cookies: Record<string, unknown>): string | undefined {
  const value = cookies[refreshCookieName];
  return typeof value === 'string' && /^[A-Za-z0-9_-]{64}$/.test(value) ? value : undefined;
}
