import type { AuthResponse, PublicUser } from '@job-board/contracts';

const configuredBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000';
const API_BASE_URL = configuredBase.endsWith('/api/v1') ? configuredBase : `${configuredBase}/api/v1`;

export class ApiError extends Error {
  public constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: Array<{ path: string; message: string }>) { super(message); }
}

interface AuthCallbacks { getToken: () => string | undefined; refresh: () => Promise<boolean>; expired: () => void; }
let authCallbacks: AuthCallbacks | undefined;
export function configureApiAuth(callbacks: AuthCallbacks): void { authCallbacks = callbacks; }

async function decode<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = payload as { error?: { code?: string; message?: string; details?: Array<{ path: string; message: string }> } } | undefined;
    throw new ApiError(response.status, error?.error?.code ?? 'REQUEST_FAILED', error?.error?.message ?? 'Something went wrong. Please try again.', error?.error?.details);
  }
  return payload as T;
}

async function send<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  const token = authCallbacks?.getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: 'include' });
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await authCallbacks?.refresh();
    if (refreshed) return send<T>(path, init, false);
    authCallbacks?.expired();
  }
  return decode<T>(response);
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => send<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => send<T>(path, body === undefined ? { method: 'POST' } : { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => send<T>(path, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => send<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => send<T>(path, { method: 'DELETE' }),
  auth: {
    login: (body: { email: string; password: string }) => send<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    register: (body: { email: string; password: string; role: 'APPLICANT' | 'EMPLOYER' }) => send<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    logout: () => send<void>('/auth/logout', { method: 'POST' }),
    refresh: () => send<AuthResponse>('/auth/refresh', { method: 'POST' }),
    me: () => send<{ user: PublicUser }>('/auth/me'),
  },
};

export function apiPath(path: string): string { return `${API_BASE_URL}${path}`; }
