/**
 * Auth Provider — Session-based authentication context
 *
 * Usage:
 *   <AuthProvider>
 *     <App />
 *   </AuthProvider>
 */

import React, { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AuthClient, createAuthClient, Session } from '../client/AuthClient';

export interface AuthContextType {
  user: Session['user'] | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True when initial setup (admin creation OR onboarding wizard) is still required. */
  needsSetup: boolean;
  /** True once an admin user exists (e.g. created via CLI or the setup wizard). */
  hasAdmin: boolean;
  /** True once the onboarding wizard has been marked complete. */
  setupCompleted: boolean;
  error: string | null;
  client: AuthClient;
  /** Clear the client-side session (e.g. after a 401 response). Does not call logout API. */
  clearSession: () => void;
  /** Update the session without affecting setup state. Used during onboarding. */
  updateSession: (session: Session) => void;
  /** Refresh session from the server (re-fetches /api/auth/session). */
  refreshSession: () => Promise<void>;
}

export type AuthContextValue = AuthContextType;

export const AuthContext = createContext<AuthContextType | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  apiUrl?: string;
  /** Optional fetch implementation — pass the WebRTC transport for remote access. */
  fetch?: typeof fetch;
}

export function AuthProvider({ children, apiUrl, fetch }: Readonly<AuthProviderProps>) {
  const client = useMemo(
    () =>
      createAuthClient({
        apiUrl,
        fetch,
      }),
    [apiUrl, fetch]
  );

  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [setupStatus, setSetupStatus] = useState<{
    hasAdmin: boolean;
    setupCompleted: boolean;
    needsSetup: boolean;
  }>({ hasAdmin: false, setupCompleted: true, needsSetup: false });
  const [error, setError] = useState<string | null>(null);

  // Check for active session on mount (cookie is HttpOnly, invisible to JS)
  useEffect(() => {
    const loadSession = async () => {
      try {
        setIsLoading(true);
        const [loaded, status] = await Promise.all([
          client.getSession(),
          client.checkSetupStatus(),
        ]);
        setSession(loaded);
        setSetupStatus(status);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load session';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, [client]);

  const clearSession = useCallback(() => setSession(null), []);
  const updateSession = useCallback((s: Session) => setSession(s), []);

  const refreshSession = useCallback(async () => {
    try {
      const [loaded, status] = await Promise.all([client.getSession(), client.checkSetupStatus()]);
      setSession(loaded);
      setSetupStatus(status);
    } catch {
      setSession(null);
    }
  }, [client]);

  const value = useMemo<AuthContextType>(
    () => ({
      user: session?.user || null,
      session,
      isAuthenticated: session !== null,
      isLoading,
      needsSetup: setupStatus.needsSetup,
      hasAdmin: setupStatus.hasAdmin,
      setupCompleted: setupStatus.setupCompleted,
      error,
      client,
      clearSession,
      updateSession,
      refreshSession,
    }),
    [session, isLoading, setupStatus, error, client, clearSession, updateSession, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
