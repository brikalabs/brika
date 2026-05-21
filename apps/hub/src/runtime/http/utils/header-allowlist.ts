/**
 * Allowlist for response headers a plugin route handler is permitted to set.
 *
 * Without this filter, plugin handlers can set arbitrary headers on the
 * `Response` served from the hub's origin — `Set-Cookie`, `Authorization`,
 * `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`,
 * `Location` — and break security guarantees of the hub UI loaded from the
 * same origin. (A plugin could, for example, set `Set-Cookie` to poison
 * the hub session or `Location` to redirect the user to an attacker site.)
 *
 * This module exposes a strict allowlist of safe response headers. Anything
 * outside it is silently dropped. Case-insensitive on the key.
 */

const ALLOWED_LOWER: ReadonlySet<string> = new Set([
  'content-type',
  'content-language',
  'content-encoding',
  'cache-control',
  'etag',
  'last-modified',
  'vary',
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-max-age',
]);

/**
 * `Location` is allowed but only on a 3xx response, where it carries
 * RFC 9110 redirect semantics. On any other status code it would be a
 * sneaky way to redirect mid-request.
 */
const REDIRECT_ONLY: ReadonlySet<string> = new Set(['location']);

/**
 * Return a header map containing only the entries the plugin is allowed to
 * set. Drops everything else (`Set-Cookie`, `Authorization`, CSP overrides,
 * `Location` on non-3xx responses, etc.).
 *
 * Header names are normalized to lowercase on the way out so callers can
 * spread the result into Response init without case collisions.
 */
export function filterPluginResponseHeaders(
  headers: Readonly<Record<string, string>> | undefined,
  status: number
): Record<string, string> {
  if (!headers) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (ALLOWED_LOWER.has(lower)) {
      out[lower] = value;
      continue;
    }
    if (REDIRECT_ONLY.has(lower) && status >= 300 && status < 400) {
      out[lower] = value;
    }
    // Anything else is silently dropped.
  }
  return out;
}
