/**
 * Query Client singleton
 */
import type { ErrorResponseBody } from '@brika/ipc';
import { ErrorResponseSchema } from '@brika/ipc';
import { QueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

/**
 * Get SSE stream URL — uses relative paths so requests go through the Vite
 * proxy in dev (preserving auth cookies) and work as-is in production.
 */
export function getStreamUrl(path: string): string {
  return path;
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
 * Base fetcher with error handling.
 *
 * Two error shapes are surfaced to React Query:
 *
 *   - `BrikaApiError` — when the response body is the platform envelope
 *     `{ error: { code, message, data?, i18nKey?, developerHint? } }`
 *     emitted by `brikaErrorToResponse`. Carries the typed code, the
 *     structured `data`, and the i18n key so UIs can branch + localize.
 *
 *   - `ApiError` — fallback for non-envelope error bodies (legacy
 *     handlers that return `{ error: "string" }` or plain text).
 *
 * `BrikaApiError extends ApiError`, so existing `instanceof ApiError`
 * checks keep working.
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

export class BrikaApiError extends ApiError {
  readonly code: string;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly i18nKey?: string;
  readonly developerHint?: string;

  constructor(status: number, envelope: ErrorResponseBody) {
    super(status, envelope.message);
    this.name = 'BrikaApiError';
    this.code = envelope.code;
    this.data = envelope.data;
    this.i18nKey = envelope.i18nKey;
    this.developerHint = envelope.developerHint;
  }
}

/** Global callback fired on any 401 response — wired by useAuthInterceptor */
let _onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(cb: (() => void) | null) {
  _onUnauthorized = cb;
}

export async function fetcher<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      _onUnauthorized?.();
    }
    const text = await res.text();
    // Try the platform error envelope first; fall back to plain text for
    // legacy/3rd-party responses that don't follow the shape.
    const envelope = text ? tryParseEnvelope(text) : null;
    if (envelope) {
      throw new BrikaApiError(res.status, envelope);
    }
    throw new ApiError(res.status, text || res.statusText);
  }
  return res.json();
}

function tryParseEnvelope(text: string): ErrorResponseBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const result = ErrorResponseSchema.safeParse(parsed);
  return result.success ? result.data.error : null;
}
