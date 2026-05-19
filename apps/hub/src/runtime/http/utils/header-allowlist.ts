/**
 * Header allowlist for plugin-supplied response headers.
 *
 * Plugin route handlers return arbitrary `headers` records that the hub spreads
 * onto a `Response` served from its own origin (127.0.0.1:3001). Without filtering,
 * a plugin could set `Set-Cookie`, `Content-Security-Policy`, `Strict-Transport-Security`,
 * `Location`, etc. — combined with same-origin trust, this is enough to poison hub
 * cookies, break CSP, or redirect to attacker-controlled sites.
 *
 * The hub keeps a hardcoded allowlist of safe response headers. Everything else is
 * silently dropped (we intentionally do not error: plugins should not be able to
 * detect filtering and adapt).
 *
 * `Location` is special-cased — it is only honored when the status is 3xx, which
 * matches the existing OAuth `authorize` pattern in `packages/sdk/src/api/oauth.ts`.
 *
 * This is a Tier 1 mitigation. A future Tier 2 enhancement may let plugins opt into
 * additional headers via their manifest — see `apps/docs/architecture/sandbox-roadmap.md`.
 */

const ALLOWED_HEADERS: ReadonlySet<string> = new Set([
  // Body negotiation
  'content-type',
  'content-language',
  'content-encoding',
  // Cache control
  'cache-control',
  'etag',
  'last-modified',
  'vary',
  // CORS (plugins may legitimately need these on their own routes)
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-allow-credentials',
  'access-control-expose-headers',
  'access-control-max-age',
]);

/**
 * Filter plugin-supplied response headers through a hardcoded allowlist.
 *
 * - Comparison is case-insensitive; original casing is preserved on output.
 * - `Location` is allowed only when `status` is in the 3xx range.
 * - Disallowed headers are silently dropped.
 */
export function filterPluginResponseHeaders(
  headers: Record<string, string> | undefined,
  status: number
): Record<string, string> {
  if (!headers) {
    return {};
  }
  const filtered: Record<string, string> = {};
  const locationAllowed = status >= 300 && status < 400;
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (ALLOWED_HEADERS.has(lower) || (lower === 'location' && locationAllowed)) {
      filtered[key] = value;
    }
  }
  return filtered;
}
