/**
 * Hub-name shape — mirrors `validateName` in `@brika/remote-access-protocol`.
 * The coordinator rejects anything else, so accepting it here would only
 * lead to a confusing 4xx later. Used as the security boundary for every
 * URL we construct from a hub name (Sonar S8476, S8480).
 */
const HUB_NAME_PATTERN = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/;

export function isValidHubName(candidate: string | null | undefined): candidate is string {
  return Boolean(candidate && HUB_NAME_PATTERN.test(candidate));
}

/**
 * Resolve the hub name the page is targeting. Order of preference:
 *
 *   1. `<meta name="brika:hub">` stamped by the signaling worker. Most
 *      reliable because the worker has D1 + the request URL.
 *   2. First non-empty path segment, validated against the same shape.
 *
 * Returns `null` when neither yields a valid name (e.g. the bare
 * `hub.brika.dev/` landing).
 */
export function readHubNameFromDocument(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const meta = document.querySelector('meta[name="brika:hub"]')?.getAttribute('content');
  if (isValidHubName(meta)) {
    return meta;
  }
  const first = location.pathname.split('/').find((s) => s.length > 0);
  if (isValidHubName(first)) {
    return first;
  }
  return null;
}

/**
 * Coordinator origin. Defaults to the page's origin (production: the
 * signaling worker serves both the bootstrap AND the API). A
 * `?coordinator=` override points the bootstrap at a locally-running
 * wrangler dev coordinator without rebuilding.
 */
export function resolveCoordinator(): string {
  const override = new URLSearchParams(location.search).get('coordinator');
  if (override) {
    try {
      return new URL(override).origin;
    } catch {
      // fall through
    }
  }
  return location.origin;
}
