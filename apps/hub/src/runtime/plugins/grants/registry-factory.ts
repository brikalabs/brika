/**
 * Hub grant registry factory.
 *
 * Builds a `GrantRegistry` per `PluginProcess` so each handler closes over
 * the plugin-scoped callbacks (logging, secret namespace, etc.). A shared
 * registry would force every handler to look up the calling plugin from a
 * session map; the per-process registry keeps that lookup at zero cost.
 *
 * The registry also computes the per-plugin vector via `buildVector` — see
 * vector.ts.
 */

import { GrantRegistry } from '@brika/grants';
import { buildDnsGrants, type DnsGrantOptions } from './dns';
import { buildNetGrants, type NetCallbacks, type NetGrantOptions } from './net';

// Type alias instead of empty `interface extends` so biome's no-empty-
// interface lint doesn't flag it. Extend with `& XyzCallbacks` as more
// grant families land.
export type HubGrantCallbacks = NetCallbacks;

/**
 * Per-family overrides callers may inject. Production wiring leaves
 * everything undefined and accepts the defaults; tests pass stub
 * resolvers / smaller caps to drive deterministic behaviour without
 * touching real DNS or fd budgets.
 */
export interface HubGrantOptions {
  readonly net?: NetGrantOptions;
  readonly dns?: DnsGrantOptions;
}

/**
 * Create a fresh registry pre-populated with every hub-owned grant.
 *
 * Adding a new grant family is: write the spec in `@brika/sdk/grants/<name>`,
 * add a `XyzCallbacks` interface and a `buildXyzGrants(cb)` factory in
 * `apps/hub/src/runtime/plugins/grants/<name>/`, extend `HubGrantCallbacks`
 * above, and register here. No PreludeBridge interface to update, no domain
 * setup module, no SDK API to add.
 */
export function buildHubGrants(cb: HubGrantCallbacks, opts?: HubGrantOptions): GrantRegistry {
  const reg = new GrantRegistry();
  for (const grant of buildNetGrants(cb, opts?.net)) {
    reg.register(grant);
  }
  for (const grant of buildDnsGrants(opts?.dns)) {
    reg.register(grant);
  }
  return reg;
}
