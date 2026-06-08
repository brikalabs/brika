/**
 * HTTP boundary helpers.
 *
 * `brikaErrorToResponse` emits RFC 9457 (Problem Details for HTTP APIs)
 * envelopes with Brika extensions. Consume this from any HTTP layer — the
 * router, the hub api-server, plugin route handlers — to convert thrown
 * values into a uniform `application/problem+json` response.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9457
 */

import { isRetryable, lookupCatalogEntry } from './catalog';
import { BrikaError } from './error';

// ─── RFC 9457 HTTP envelope ────────────────────────────────────────────────

/**
 * Problem Details envelope (RFC 9457) plus Brika extensions.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9457
 */
export interface BrikaErrorResponseBody {
  /** RFC 9457: URI identifying the problem type. */
  readonly type: string;
  /** RFC 9457: short human-readable summary. */
  readonly title: string;
  /** RFC 9457: HTTP status code (matches the response status). */
  readonly status: number;
  /** RFC 9457: human-readable explanation specific to this occurrence. */
  readonly detail: string;
  /** RFC 9457: URI reference identifying this specific occurrence (optional). */
  readonly instance?: string;

  // ─── Brika extensions ────────────────────────────────────────────────
  /** Machine-readable code (extension member). */
  readonly code: string;
  /** Structured payload typed per code (extension member). */
  readonly data?: Readonly<Record<string, unknown>>;
  /** i18n lookup key for the FE (extension member). */
  readonly i18nKey?: string;
  /** Actionable advice for plugin authors (extension member). */
  readonly developerHint?: string;
  /** Whether the client should retry without changing inputs (extension). */
  readonly retryable: boolean;
  /** Correlation id from the request context, if available (extension). */
  readonly traceId?: string;
}

/** Options accepted by {@link brikaErrorToResponse}. */
export interface ResponseOptions {
  /** Correlation id; surfaces in the envelope as `traceId`. */
  readonly traceId?: string;
  /** Request path/URL surfaced as `instance` (RFC 9457). */
  readonly instance?: string;
}

const UNCATALOGED_TYPE = 'about:blank';
const UNCATALOGED_TITLE = 'Internal error';

/**
 * Apply the catalog's `publicDataShape` to `err.data` before it crosses the
 * HTTP boundary, exactly as `toWire` does for IPC. Without this, redacted
 * fields (net/fs allow-lists, blocked IPs, symlink-escape paths) leak verbatim
 * to API consumers. A shape that fails to parse drops `data` (empty over
 * over-shared); a code with no shape passes data through unchanged.
 */
function toPublicData(
  entry: ReturnType<typeof lookupCatalogEntry>,
  data: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> | undefined {
  if (!data) {
    return undefined;
  }
  const publicShape = entry?.publicDataShape;
  if (!publicShape) {
    return { ...data };
  }
  const parsed = publicShape.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Convert any thrown value to an HTTP `Response` shaped per RFC 9457
 * (Problem Details for HTTP APIs) plus Brika extensions. BrikaErrors emit
 * the catalog's `status`; everything else collapses to 500 INTERNAL with
 * no leaked message.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9457
 */
export function brikaErrorToResponse(err: unknown, opts?: ResponseOptions): Response {
  if (err instanceof BrikaError) {
    const entry = lookupCatalogEntry(err.code);
    const status = entry?.status ?? 500;
    const publicData = toPublicData(entry, err.data);
    const body: BrikaErrorResponseBody = {
      type: entry?.typeUri ?? UNCATALOGED_TYPE,
      title: entry?.title ?? UNCATALOGED_TITLE,
      status,
      detail: err.message,
      code: err.code,
      retryable: isRetryable(err.code),
      ...(opts?.instance ? { instance: opts.instance } : {}),
      ...(opts?.traceId ? { traceId: opts.traceId } : {}),
      ...(publicData ? { data: publicData } : {}),
      ...(entry?.i18nKey ? { i18nKey: entry.i18nKey } : {}),
      ...(entry?.developerHint ? { developerHint: entry.developerHint } : {}),
    };
    return Response.json(body, {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    });
  }
  const body: BrikaErrorResponseBody = {
    type: UNCATALOGED_TYPE,
    title: UNCATALOGED_TITLE,
    status: 500,
    detail: 'Internal server error',
    code: 'INTERNAL',
    retryable: false,
    ...(opts?.instance ? { instance: opts.instance } : {}),
    ...(opts?.traceId ? { traceId: opts.traceId } : {}),
  };
  return Response.json(body, {
    status: 500,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}
