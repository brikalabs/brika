/**
 * Query Client singleton + fetcher with typed BrikaError consumption.
 *
 * Errors that arrive as RFC 9457 problem+json envelopes are surfaced as
 * `BrikaApiError`. Use `isBrikaApiError(err, 'CODE')` to narrow code + data,
 * or `err.retryable` to decide whether to auto-retry.
 */
import type { CatalogedErrorCode, DataForCode } from '@brika/errors';
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
      retry: (failureCount, error) => {
        if (error instanceof BrikaApiError) {
          return error.retryable && failureCount < 3;
        }
        return failureCount < 1;
      },
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
 * Typed error envelope thrown when the server responds with an RFC 9457
 * problem+json payload. Subclass of {@link ApiError} so existing
 * `instanceof ApiError` checks continue to match.
 */
export class BrikaApiError extends ApiError {
  readonly code: string;
  readonly type: string;
  readonly title: string;
  readonly detail: string;
  readonly retryable: boolean;
  readonly data?: Record<string, unknown>;
  readonly i18nKey?: string;
  readonly developerHint?: string;
  readonly instance?: string;
  readonly traceId?: string;

  constructor(args: {
    status: number;
    code: string;
    type: string;
    title: string;
    detail: string;
    retryable: boolean;
    data?: Record<string, unknown>;
    i18nKey?: string;
    developerHint?: string;
    instance?: string;
    traceId?: string;
  }) {
    super(args.status, args.detail);
    this.name = 'BrikaApiError';
    this.code = args.code;
    this.type = args.type;
    this.title = args.title;
    this.detail = args.detail;
    this.retryable = args.retryable;
    this.data = args.data;
    this.i18nKey = args.i18nKey;
    this.developerHint = args.developerHint;
    this.instance = args.instance;
    this.traceId = args.traceId;
  }
}

const BrikaErrorEnvelopeSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string(),
  code: z.string(),
  retryable: z.boolean(),
  data: z.record(z.string(), z.unknown()).optional(),
  i18nKey: z.string().optional(),
  developerHint: z.string().optional(),
  instance: z.string().optional(),
  traceId: z.string().optional(),
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

/**
 * Parse a non-OK Response into an ApiError. Returns a BrikaApiError when
 * the body is an RFC 9457 problem+json envelope; otherwise an ApiError
 * with the raw text body.
 */
export async function readErrorResponse(res: Response): Promise<ApiError> {
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
      code: parsed.data.code,
      type: parsed.data.type,
      title: parsed.data.title,
      detail: parsed.data.detail,
      retryable: parsed.data.retryable,
      data: parsed.data.data,
      i18nKey: parsed.data.i18nKey,
      developerHint: parsed.data.developerHint,
      instance: parsed.data.instance,
      traceId: parsed.data.traceId,
    });
  }
  return new ApiError(res.status, text);
}
