/**
 * Query Client singleton
 */
import type { CatalogedErrorCode, DataForCode } from '@brika/ipc/errors';
import { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
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

/**
 * Typed error envelope thrown when the server responds with a BrikaError
 * payload. Subclass of {@link ApiError} so existing `instanceof ApiError`
 * checks continue to match.
 */
export class BrikaApiError extends ApiError {
  readonly code: string;
  readonly data?: Record<string, unknown>;
  readonly i18nKey?: string;
  readonly developerHint?: string;

  constructor(args: {
    status: number;
    code: string;
    message: string;
    data?: Record<string, unknown>;
    i18nKey?: string;
    developerHint?: string;
  }) {
    super(args.status, args.message);
    this.name = 'BrikaApiError';
    this.code = args.code;
    this.data = args.data;
    this.i18nKey = args.i18nKey;
    this.developerHint = args.developerHint;
  }
}

const BrikaErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    data: z.record(z.string(), z.unknown()).optional(),
    i18nKey: z.string().optional(),
    developerHint: z.string().optional(),
  }),
});

/**
 * Narrows an unknown thrown value to a `BrikaApiError` with the given code,
 * surfacing the catalog's typed `data` shape via `DataForCode<C>`. Mirrors
 * `BrikaError.is` from `@brika/ipc` for the HTTP boundary.
 *
 * @example
 * ```ts
 * if (isBrikaApiError(err, 'PERMISSION_DENIED')) {
 *   showToast(`Missing permission: ${err.data?.permission}`);
 * }
 * ```
 */
export function isBrikaApiError<C extends CatalogedErrorCode>(
  err: unknown,
  code: C
): err is BrikaApiError & { readonly code: C; readonly data?: DataForCode<C> } {
  return err instanceof BrikaApiError && err.code === code;
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
    throw await readErrorResponse(res);
  }
  return res.json();
}

async function readErrorResponse(res: Response): Promise<ApiError> {
  const text = await res.text();
  if (!text) {
    return new ApiError(res.status, res.statusText);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return new ApiError(res.status, text);
  }

  const parsed = BrikaErrorEnvelopeSchema.safeParse(json);
  if (parsed.success) {
    return new BrikaApiError({
      status: res.status,
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      data: parsed.data.error.data,
      i18nKey: parsed.data.error.i18nKey,
      developerHint: parsed.data.error.developerHint,
    });
  }
  return new ApiError(res.status, text);
}
