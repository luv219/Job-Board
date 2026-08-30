import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, configureApiAuth } from './api.js';

describe('API client', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('refreshes once and retries a protected request once', async () => {
    let token = 'expired-token'; let refreshes = 0;
    configureApiAuth({ getToken: () => token, refresh: async () => { refreshes += 1; token = 'fresh-token'; return true; }, expired: vi.fn() });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required' } }), { status: 401 })).mockResolvedValueOnce(new Response(JSON.stringify({ value: 'ok' }), { status: 200 }));
    await expect(api.get<{ value: string }>('/applicant/dashboard')).resolves.toEqual({ value: 'ok' });
    expect(refreshes).toBe(1); expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe('Bearer fresh-token');
  });
});
