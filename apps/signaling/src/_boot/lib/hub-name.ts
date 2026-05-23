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
