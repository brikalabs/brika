/**
 * Hub capability registry factory.
 *
 * Builds a `CapabilityRegistry` per `PluginProcess` so each handler closes
 * over the plugin-scoped callbacks (logging, preference reads, etc.). A
 * shared registry would force every handler to look up the calling plugin
 * from a session map; the per-process registry keeps that lookup at zero
 * cost.
 *
 * The registry is also what computes the per-plugin capability vector
 * (`buildVector`) at spawn time — see `vector.ts` for the wiring.
 */

import { CapabilityRegistry } from '@brika/capabilities';
import { buildLocationCapabilities, type LocationCallbacks } from './location';

export interface HubCapabilityCallbacks extends LocationCallbacks {
  // Future capability families (secrets, sparks, net, fs, exec, …) extend
  // this interface as they migrate to the registry.
}

/**
 * Create a fresh registry pre-populated with every hub-owned capability.
 *
 * Adding a new capability is: write the spec in `@brika/sdk/capabilities/<id>`,
 * write a handler in `apps/hub/src/runtime/plugins/capabilities/<id>.ts`,
 * register it here. No bridge interface to update, no domain setup module,
 * no SDK API to add.
 */
export function buildHubCapabilities(cb: HubCapabilityCallbacks): CapabilityRegistry {
  const reg = new CapabilityRegistry();
  for (const cap of buildLocationCapabilities(cb)) {
    reg.register(cap);
  }
  return reg;
}
