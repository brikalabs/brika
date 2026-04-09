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
  /** True when no admin exists and initial setup is required. */
  needsSetup: boolean;
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
}

export function AuthProvider({ children, apiUrl }: Readonly<AuthProviderProps>) {
  const client = useMemo(
    () =>
      createAuthClient({
        apiUrl,
      }),
    []
  );

  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
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
        setNeedsSetup(status.needsSetup);
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
      setNeedsSetup(status.needsSetup);
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
      needsSetup,
      error,
      client,
      clearSession,
      updateSession,
      refreshSession,
    }),
    [session, isLoading, needsSetup, error, client, clearSession, updateSession, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
