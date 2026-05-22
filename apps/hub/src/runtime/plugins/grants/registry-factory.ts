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
import { buildNetGrants, type NetCallbacks } from './net';

export interface HubGrantCallbacks extends NetCallbacks {}

/**
 * Create a fresh registry pre-populated with every hub-owned grant.
 *
 * Adding a new grant family is: write the spec in `@brika/sdk/grants/<name>`,
 * add a `XyzCallbacks` interface and a `buildXyzGrants(cb)` factory in
 * `apps/hub/src/runtime/plugins/grants/<name>.ts`, extend `HubGrantCallbacks`
 * above, and register here. No PreludeBridge interface to update, no domain
 * setup module, no SDK API to add.
 */
export function buildHubGrants(cb: HubGrantCallbacks): GrantRegistry {
  const reg = new GrantRegistry();
  for (const grant of buildNetGrants(cb)) {
    reg.register(grant);
  }
  return reg;
}
