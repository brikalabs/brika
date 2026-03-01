import { useAuth } from '@brika/auth/react';
import { useEffect } from 'react';
import { setOnUnauthorized } from '@/lib/query';

/**
 * Registers a global 401 interceptor that clears the session
 * when any API call returns Unauthorized.
 *
 * Call once in RootLayout.
 */
export function useAuthInterceptor() {
  const { clearSession } = useAuth();

  useEffect(() => {
    setOnUnauthorized(() => clearSession());
    return () => setOnUnauthorized(null);
  }, [clearSession]);
}
