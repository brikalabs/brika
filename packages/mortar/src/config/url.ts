/**
 * Best-effort URL to surface in the TUI and open via `o`.
 *
 *   1. `spec.url` (explicit YAML override — wins, supports deep links)
 *   2. `spec.port` (declared TCP port — the authoritative source)
 *   3. The runtime-detected port (from `health: auto`)
 *   4. The static port from `tcp` / `http` healthcheck
 *   5. `null` (nothing to open)
 */

import type { ServiceSpec } from './types';

export function serviceUrl(spec: ServiceSpec, detectedPort: number | null = null): string | null {
  if (spec.url) {
    return spec.url;
  }
  if (spec.port !== null) {
    return `http://localhost:${spec.port}/`;
  }
  if (detectedPort !== null) {
    return `http://localhost:${detectedPort}/`;
  }
  if (spec.health.kind === 'tcp') {
    return `http://localhost:${spec.health.port}/`;
  }
  if (spec.health.kind === 'http') {
    try {
      return `${new URL(spec.health.url).origin}/`;
    } catch {
      return null;
    }
  }
  return null;
}
