import type { IncomingMessage } from 'node:http';

/**
 * Resolve the host header from `req.headers.host` for the same-origin check.
 * Treats missing/invalid headers as "unknown" — the caller rejects the
 * request rather than guessing.
 */
function sameOriginHost(req: IncomingMessage): string | null {
  const host = req.headers.host;
  return typeof host === 'string' && host.length > 0 ? host : null;
}

/**
 * Reject requests originating from a different origin. Only the `host` field
 * of `Origin` / `Referer` is compared — scheme is ignored. A state-changing
 * endpoint must see at least one of the two headers (both missing is the
 * shape of a `<img src>` / `<script src>` drive-by from a cross-origin page).
 */
export function isSameOrigin(req: IncomingMessage): boolean {
  const expected = sameOriginHost(req);
  if (!expected) {
    return false;
  }
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (typeof origin !== 'string' && typeof referer !== 'string') {
    return false;
  }
  for (const raw of [origin, referer]) {
    if (typeof raw !== 'string' || raw.length === 0) {
      continue;
    }
    let candidateHost: string;
    try {
      candidateHost = new URL(raw).host;
    } catch {
      return false;
    }
    if (candidateHost !== expected) {
      return false;
    }
  }
  return true;
}
