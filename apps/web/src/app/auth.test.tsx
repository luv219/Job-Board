import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthResponse } from '@job-board/contracts';
import { AuthProvider, useAuth } from './auth.js';
import { queryClient } from './query-client.js';
import { api } from '../lib/api.js';

const applicant: AuthResponse = {
  accessToken: 'synthetic-access-token', expiresIn: 600,
  user: { id: 'applicant-a', email: 'applicant-a@example.test', role: 'APPLICANT', accountStatus: 'ACTIVE', emailVerified: false, createdAt: '2026-01-01T00:00:00.000Z' },
};

function Harness() {
  const auth = useAuth();
  return <><p>{auth.status}:{auth.user?.email ?? 'none'}</p><button onClick={() => void auth.login('applicant-a@example.test', 'synthetic password')}>Log in</button><button onClick={() => void auth.logout()}>Log out</button></>;
}

afterEach(() => { queryClient.clear(); vi.restoreAllMocks(); window.localStorage.clear(); window.sessionStorage.clear(); });

describe('authentication context privacy', () => {
  it('clears private query data on logout without persisting browser credentials', async () => {
    vi.spyOn(api.auth, 'refresh').mockRejectedValue(new Error('no session'));
    vi.spyOn(api.auth, 'login').mockResolvedValue(applicant);
    vi.spyOn(api.auth, 'logout').mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AuthProvider><Harness /></AuthProvider>);
    await screen.findByText('unauthenticated:none');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByText('authenticated:applicant-a@example.test');
    queryClient.setQueryData(['private', 'applicant-a'], { name: 'Applicant A' });
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(screen.getByText('unauthenticated:none')).toBeInTheDocument());
    expect(queryClient.getQueryData(['private', 'applicant-a'])).toBeUndefined();
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });
});
