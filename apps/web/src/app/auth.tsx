import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { AuthResponse, PublicUser } from '@job-board/contracts';
import { api, configureApiAuth } from '../lib/api.js';
import { queryClient } from './query-client.js';

type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated';
interface AuthContextValue { status: AuthStatus; user: PublicUser | undefined; login: (email: string, password: string) => Promise<PublicUser>; register: (email: string, password: string, role: 'APPLICANT' | 'EMPLOYER') => Promise<PublicUser>; logout: () => Promise<void>; resendVerification: () => Promise<void>; }
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const token = useRef<string | undefined>(undefined);
  const refreshPromise = useRef<Promise<boolean> | undefined>(undefined);
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [user, setUser] = useState<PublicUser | undefined>(undefined);
  const accept = useCallback((response: AuthResponse) => { token.current = response.accessToken; setUser(response.user); setStatus('authenticated'); return response.user; }, []);
  const clear = useCallback(() => { token.current = undefined; setUser(undefined); setStatus('unauthenticated'); queryClient.clear(); }, []);
  const refresh = useCallback(async () => {
    if (!refreshPromise.current) refreshPromise.current = api.auth.refresh().then((response) => { accept(response); return true; }).catch(() => { clear(); return false; }).finally(() => { refreshPromise.current = undefined; });
    return refreshPromise.current!;
  }, [accept, clear]);
  useEffect(() => { configureApiAuth({ getToken: () => token.current, refresh, expired: clear }); void refresh(); }, [clear, refresh]);
  const value = useMemo<AuthContextValue>(() => ({
    status, user,
    login: async (email, password) => accept(await api.auth.login({ email, password })),
    register: async (email, password, role) => accept(await api.auth.register({ email, password, role })),
    logout: async () => { try { await api.auth.logout(); } finally { clear(); } },
    resendVerification: async () => { await api.post<void>('/auth/email-verification/request'); },
  }), [accept, clear, status, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context; }
export function dashboardPath(user: PublicUser): string { return user.role === 'APPLICANT' ? '/applicant' : '/employer'; }
