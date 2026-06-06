/**
 * Internal types and defaults for the `net.fetch` grant handler.
 *
 * Public types (`FetchArgs`, `FetchResult`, `NetScope`) live in
 * `@brika/sdk/grants/net` and cross the IPC boundary. Anything in here is
 * hub-private — host-side only, never serialized to plugin code.
 */

/** Allowed URL schemes. Any other protocol is rejected before DNS or fetch. */
export const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Wall-clock cap for a single fetch attempt (overridable per call). */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Cap on exponential backoff between retries — and on Retry-After delays. */
export const MAX_BACKOFF_MS = 30_000;

/**
 * Per-call body cap if the caller doesn't specify one. 10 MiB is generous for
 * typical JSON APIs and small enough that a hostile server can't OOM the hub
 * even with no per-call override.
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

/** Max redirect hops if the caller doesn't override. */
export const DEFAULT_MAX_REDIRECTS = 5;

/** Max concurrent in-flight fetches per plugin. */
export const DEFAULT_MAX_CONCURRENT = 16;

/** Methods that retry only when the caller provides an idempotency key. */
export const NON_IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(['POST', 'PATCH']);

/** Status codes the retry policy considers worth another attempt. */
export const RETRYABLE_STATUS: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Status codes that signal "follow the Location header". */
export const REDIRECT_STATUS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** Hub-side fetch shim. Production wires this to `globalThis.fetch`; tests inject a mock. */
export interface NetCallbacks {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

/**
 * Hub-private intermediate response — what we send back across IPC after
 * the handler has finished retries, redirects, and body buffering.
 */
export interface FetchResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /**
   * Every `Set-Cookie` response header, preserved individually. The flat
   * `headers` map can only hold one value per key, so a response that sets
   * several cookies at once (F5 BIG-IP / SSO flows) would otherwise lose
   * all but the last. Carried separately so the plugin-side `Response`
   * exposes each cookie via `getSetCookie()` / `forEach`.
   */
  setCookies: string[];
  body: string;
  attempts: number;
}
