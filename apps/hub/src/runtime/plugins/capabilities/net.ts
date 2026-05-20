/**
 * Hub-side handler for the `net.fetch` capability.
 *
 * Plugins call `ctx.net.fetch({...})`; the hub performs the actual request
 * here, enforces the host allowlist from the granted scope, applies a
 * timeout (default 30s, capped at 5 min by the spec), and returns the
 * serialized response.
 *
 * Closes findings N1 (no chokepoint), N2 (missing timeout), N7 (no abort
 * thread) from the audit — they collapse into one well-tested handler.
 */

import { defineCapability } from '@brika/capabilities';
import { netFetch as spec } from '@brika/sdk/capabilities';

const DEFAULT_TIMEOUT_MS = 30_000;

/** Match a host against a pattern. Supports literals and one-level `*.` wildcards. */
export function matchesHostPattern(host: string, pattern: string): boolean {
  if (pattern === host) {
    return true;
  }
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    // `*.googleapis.com` matches `foo.googleapis.com` but not the bare
    // `googleapis.com` (which would need to be allow-listed explicitly).
    return host.endsWith(`.${suffix}`);
  }
  return false;
}

export function isHostAllowed(host: string, allow: ReadonlyArray<string>): boolean {
  for (const pattern of allow) {
    if (matchesHostPattern(host, pattern)) {
      return true;
    }
  }
  return false;
}

export interface NetCallbacks {
  /**
   * Perform an HTTP request. Wired to `globalThis.fetch` in production;
   * tests override with a mock.
   */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

interface NetScope {
  allow: ReadonlyArray<string>;
}

export function buildNetCapabilities(cb: NetCallbacks) {
  return [
    defineCapability(spec.spec, async (ctx, args) => {
      const scope = ctx.grantedScope as NetScope;
      const host = new URL(args.url).host;
      if (!isHostAllowed(host, scope.allow)) {
        throw new Error(
          `net.fetch: host "${host}" is not in this plugin's allow list (${scope.allow.join(', ') || '(empty)'})`
        );
      }

      const controller = new AbortController();
      const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const timer = setTimeout(() => controller.abort(new Error(`net.fetch: timed out after ${timeoutMs}ms`)), timeoutMs);

      try {
        const res = await cb.fetch(args.url, {
          method: args.method,
          headers: args.headers,
          body: args.body,
          signal: controller.signal,
        });
        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return {
          status: res.status,
          statusText: res.statusText,
          headers,
          body: await res.text(),
        };
      } finally {
        clearTimeout(timer);
      }
    }),
  ];
}
