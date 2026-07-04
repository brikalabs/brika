import type { Backend } from './types';

/**
 * Prepend a machine-readable provenance banner. Two backends emit
 * equivalent-but-not-identical bytes and share a content-hash cache, so an
 * artifact must record which backend + `version` built it: for debugging a
 * mismatch, and so a cache key can include the backend and never cross-serve a
 * Bun-built file where the isolate is active (or vice versa).
 *
 * `version` is passed in (not imported) so this module stays free of the Bun
 * `output-version` macro and can be bundled for a Cloudflare Worker.
 */
export function stamp(js: string, backend: Backend, version: string): string {
  return `/* @brika-bundle:${backend}@${version} */\n${js}`;
}

// Anchored to byte 0: `stamp()` always writes the banner first, and matching it
// anywhere would false-positive on a bundled plugin's own source that happens to
// contain the pattern (sucrase preserves comments). A serve-time consumer that
// prepends a CSS snippet ahead of the bundle must strip it before readStamp.
const STAMP_RE = /^\/\* @brika-bundle:([a-z]+)@([^\s*]+) \*\//;

/** Read the provenance banner a `stamp()` wrote, or null if unstamped. */
export function readStamp(js: string): { backend: string; version: string } | null {
  const m = STAMP_RE.exec(js);
  const [, backend, version] = m ?? [];
  if (backend === undefined || version === undefined) {
    return null;
  }
  return { backend, version };
}
