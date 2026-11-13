import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import axios from 'axios';
import * as authApi from '../api/auth';
import { setUnauthorizedHandler, tokenStorage } from '../api/client';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: authApi.User | null;
  /** Logs in and returns the user (so callers can check the role, e.g. the admin login). */
  login: (payload: authApi.LoginPayload) => Promise<authApi.User>;
  register: (payload: authApi.RegisterPayload) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<authApi.User | null>(null);
  // If a token is stored we must check it with the server before deciding.
  const [status, setStatus] = useState<Status>(() => (tokenStorage.get() ? 'loading' : 'anonymous'));

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const applyAuth = useCallback((res: authApi.AuthResponse): authApi.User => {
    tokenStorage.set(res.token);
    setUser(res.user);
    setStatus('authenticated');
    return res.user;
  }, []);

  // Any 401 on an authenticated request (expired/invalid token) logs the user out.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // On startup: restore the session from the stored token.
  useEffect(() => {
    if (!tokenStorage.get()) return;
    let cancelled = false;
    authApi
      .fetchMe()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setStatus('authenticated');
      })
      .catch((err) => {
        if (cancelled) return;
        // Only drop the token if the server rejected it; keep it on network errors
        // so a brief API outage doesn't log the user out.
        if (axios.isAxiosError(err) && err.response?.status === 401) logout();
        else setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login: async (payload) => applyAuth(await authApi.login(payload)),
      register: async (payload) => {
        applyAuth(await authApi.register(payload));
      },
      logout,
    }),
    [status, user, applyAuth, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
