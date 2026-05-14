/**
 * Pure helpers that map an incoming HTTP request URL to the hub it's
 * targeting. Extracted from `worker.ts` so the logic is unit-testable in Bun
 * (the rest of `worker.ts` pulls in Cloudflare-only globals).
 */

/**
 * Hub name shape. Mirrors `validateName` in `@brika/remote-access-protocol`
 * but as a single anchored regex — at this layer we just need a syntactic
 * accept-or-reject; full validation (reserved names, length bounds in the
 * formal sense) is the claim flow's job.
 */
const HUB_NAME_PATTERN = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/;

/**
 * Path prefixes the asset binding owns directly. Resolving these as hub
 * names would hijack the static asset URLs (`/assets/index-XXX.js` →
 * "hub `assets` exists, strip to /index-XXX.js → SPA fallback → HTML",
 * which silently breaks the bootstrap's own JS + CSS). The first segment
 * is checked against this set BEFORE the regex.
 */
const ASSET_PREFIXES: ReadonlySet<string> = new Set([
  'assets',
  'sw.js',
  'favicon.ico',
  'favicon.svg',
  'robots.txt',
  'manifest.json',
]);

export interface ResolvedHub {
  /** The hub-name segment as it appeared in the URL. Lowercase, validated. */
  readonly hubName: string;
  /**
   * The path portion to forward to the asset binding — everything after the
   * `/<name>` prefix, with a leading slash kept so the SPA fallback still
   * maps to `/index.html`.
   */
  readonly restPath: string;
}

/**
 * Resolve the hub name a request is targeting. Two shapes are accepted:
 *
 *   1. `/<name>[/rest]` — path-based, the canonical production form.
 *   2. `/?hub=<name>`   — query override, used in dev where every hub serves
 *                          from the same `localhost:5174/` root.
 *
 * Returns `null` when neither matches a valid hub name; caller falls back
 * to regular asset serving or a 404.
 *
 * Hostname is intentionally ignored: a single Worker now serves every host
 * the deployment cares about. The caller is responsible for excluding the
 * API prefix (`/v1/*`) before invoking this.
 */
export function resolveHubFromUrl(url: URL): ResolvedHub | null {
  // 1. Path-based.
  const match = /^\/([^/]+)(\/.*)?$/.exec(url.pathname);
  const pathCandidate = match?.[1];
  if (pathCandidate && HUB_NAME_PATTERN.test(pathCandidate) && !ASSET_PREFIXES.has(pathCandidate)) {
    return { hubName: pathCandidate, restPath: match?.[2] ?? '/' };
  }
  // 2. Query-based. `?hub=<name>` on the root path. Lets the bootstrap stamp
  // the `brika:hub` meta tag in the served HTML *before* the bootstrap's JS
  // runs — which avoids a race where the hub UI's `detectRemote` evaluates
  // against a still-unstamped DOM.
  const queryCandidate = url.searchParams.get('hub')?.toLowerCase();
  if (queryCandidate && HUB_NAME_PATTERN.test(queryCandidate)) {
    return { hubName: queryCandidate, restPath: url.pathname };
  }
  return null;
}

/**
 * Rewrite an HTML response to include `<meta name="brika:hub" content=...>`.
 * The bootstrap script in the UI reads this tag to learn which hub to
 * connect to — works for every URL form the worker accepts.
 *
 * Non-HTML responses pass through unchanged. The function only touches
 * `Content-Length` to avoid serving a stale length after the rewrite; the
 * Workers runtime recomputes it on send.
 */
export async function injectHubMeta(res: Response, hubName: string): Promise<Response> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/html')) {
    return res;
  }
  const html = await res.text();
  const tag = `<meta name="brika:hub" content="${escapeHtmlAttr(hubName)}">`;
  const injected = html.includes('</head>')
    ? html.replace('</head>', `${tag}</head>`)
    : `${tag}${html}`;
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  return new Response(injected, { status: res.status, headers });
}

function escapeHtmlAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
