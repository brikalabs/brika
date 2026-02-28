/**
 * Auth Provider — Session-based authentication context
 *
 * Usage:
 *   <AuthProvider>
 *     <App />
 *   </AuthProvider>
 */

import React, { createContext, useCallback, useEffect, useMemo, useState, ReactNode } from 'react';
import { AuthClient, Session, createAuthClient } from '../client/AuthClient';

export interface AuthContextType {
  user: Session['user'] | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  client: AuthClient;
  /** Clear the client-side session (e.g. after a 401 response). Does not call logout API. */
  clearSession: () => void;
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
  const client = useMemo(() => createAuthClient({ apiUrl }), []);

  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for active session on mount (cookie is HttpOnly, invisible to JS)
  useEffect(() => {
    const loadSession = async () => {
      try {
        setIsLoading(true);
        const loaded = await client.getSession();
        setSession(loaded);
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

  const refreshSession = useCallback(async () => {
    try {
      const loaded = await client.getSession();
      setSession(loaded);
    } catch {
      setSession(null);
    }
  }, [client]);

  const value = useMemo<AuthContextType>(() => ({
    user: session?.user || null,
    session,
    isAuthenticated: session !== null,
    isLoading,
    error,
    client,
    clearSession,
    refreshSession,
  }), [session, isLoading, error, client, clearSession, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
