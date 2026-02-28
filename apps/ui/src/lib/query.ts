/**
 * Query Client singleton
 */
import { QueryClient } from '@tanstack/react-query';

/**
 * Get API base URL - in dev, connect directly to hub to avoid Vite proxy SSE issues
 */
export const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:3001' : '';

/**
 * Get SSE stream URL (bypasses Vite proxy in dev mode)
 */
export function getStreamUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 10,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

/**
 * Base fetcher with error handling
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Global callback fired on any 401 response — wired by useAuthInterceptor */
let _onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(cb: (() => void) | null) {
  _onUnauthorized = cb;
}

export async function fetcher<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    if (res.status === 401) _onUnauthorized?.();
    throw new ApiError(res.status, (await res.text()) || res.statusText);
  }
  return res.json();
}
