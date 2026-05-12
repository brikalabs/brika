/**
 * Pure helpers that map an incoming HTTP request URL to the hub it's
 * targeting. Extracted from `worker.ts` so the logic is unit-testable in Bun
 * (the rest of `worker.ts` pulls in Cloudflare-only globals).
 */

/** Path-based pretty host: `hub.brika.dev/<name>[/rest]`. */
export const PATH_HOST = 'hub.brika.dev';

/** Legacy subdomain form: `<name>.hubs.brika.dev`. */
export const SUBDOMAIN_SUFFIX = '.hubs.brika.dev';

/**
 * Hub name shape. Mirrors `validateName` in `@brika/remote-access-protocol`
 * but as a single anchored regex — at this layer we just need a syntactic
 * accept-or-reject; full validation (reserved names, length bounds in the
 * formal sense) is the claim flow's job.
 */
const HUB_NAME_PATTERN = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/;

export interface ResolvedHub {
  /** The hub-name segment as it appeared in the URL. Lowercase, validated. */
  readonly hubName: string;
  /**
   * The path portion to forward to the asset binding. For the subdomain form
   * this is the original `url.pathname`; for the path form it's everything
   * after the `/<name>` prefix (with a leading slash kept so SPA fallback
   * still maps to `/index.html`).
   */
  readonly restPath: string;
}

/**
 * Resolve the hub name a request is targeting. Returns `null` when the host
 * + path combination doesn't identify any hub — the caller falls back to
 * regular asset serving (or 404).
 */
export function resolveHubFromUrl(url: URL): ResolvedHub | null {
  if (url.hostname === PATH_HOST) {
    const match = /^\/([^/]+)(\/.*)?$/.exec(url.pathname);
    const candidate = match?.[1];
    if (!candidate || !HUB_NAME_PATTERN.test(candidate)) {
      return null;
    }
    return { hubName: candidate, restPath: match?.[2] ?? '/' };
  }
  const host = url.hostname.toLowerCase();
  if (host.endsWith(SUBDOMAIN_SUFFIX)) {
    const candidate = host.slice(0, -SUBDOMAIN_SUFFIX.length);
    if (candidate && HUB_NAME_PATTERN.test(candidate)) {
      return { hubName: candidate, restPath: url.pathname };
    }
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
