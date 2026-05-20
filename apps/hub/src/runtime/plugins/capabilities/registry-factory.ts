/**
 * Hub capability registry factory.
 *
 * Builds a `CapabilityRegistry` per `PluginProcess` so each handler closes
 * over the plugin-scoped callbacks (logging, preference reads, secrets keyed
 * by the calling plugin, etc.). A shared registry would force every handler
 * to look up the calling plugin from a session map; the per-process registry
 * keeps that lookup at zero cost.
 *
 * The registry is also what computes the per-plugin capability vector
 * (`buildVector`) at spawn time — see `vector.ts`.
 */

import { CapabilityRegistry } from '@brika/capabilities';
import type { SparkEvent as SparkEventType } from '@brika/ipc/contract';
import { type ActionsCallbacks, buildActionsCapabilities } from './actions';
import { type BlocksCallbacks, buildBlocksCapabilities } from './blocks';
import { type BricksCallbacks, buildBricksCapabilities } from './bricks';
import { buildLocationCapabilities, type LocationCallbacks } from './location';
import { buildPrefsCapabilities, type PrefsCallbacks } from './prefs';
import { buildRoutesCapabilities, type RoutesCallbacks } from './routes';
import { buildSecretsCapabilities, type SecretsCallbacks } from './secrets';
import { buildSparksCapabilities, type SparksCallbacks } from './sparks';

/**
 * Union of every per-domain callback interface. PluginProcess builds one
 * object satisfying this shape and feeds the same instance into every
 * `buildXyzCapabilities` factory.
 */
export interface HubCapabilityCallbacks
  extends LocationCallbacks,
    ActionsCallbacks,
    RoutesCallbacks,
    PrefsCallbacks,
    SecretsCallbacks,
    SparksCallbacks,
    BlocksCallbacks,
    BricksCallbacks {}

/**
 * Create a fresh registry pre-populated with every hub-owned capability.
 *
 * Adding a new capability family is: write the spec in
 * `@brika/sdk/capabilities/<id>`, add a `Xyz Callbacks` interface and a
 * `buildXyzCapabilities(cb, ...args)` factory in
 * `apps/hub/src/runtime/plugins/capabilities/<id>.ts`, then extend the
 * union above and register here. No PreludeBridge interface to update, no
 * domain setup module, no SDK API to add.
 *
 * `pluginName` is threaded into secrets so the same callback can be used
 * across plugins without leaking — each `PluginProcess` passes its own name.
 */
export function buildHubCapabilities(
  cb: HubCapabilityCallbacks,
  pluginName: string,
  sendSparkEvent: (subscriptionId: string, event: SparkEventType) => void
): CapabilityRegistry {
  const reg = new CapabilityRegistry();
  for (const cap of buildLocationCapabilities(cb)) {
    reg.register(cap);
  }
  for (const cap of buildActionsCapabilities(cb)) {
    reg.register(cap);
  }
  for (const cap of buildRoutesCapabilities(cb)) {
    reg.register(cap);
  }
  for (const cap of buildPrefsCapabilities(cb)) {
    reg.register(cap);
  }
  for (const cap of buildSecretsCapabilities(cb, pluginName)) {
    reg.register(cap);
  }
  for (const cap of buildSparksCapabilities(cb, sendSparkEvent)) {
    reg.register(cap);
  }
  for (const cap of buildBlocksCapabilities(cb)) {
    reg.register(cap);
  }
  for (const cap of buildBricksCapabilities(cb)) {
    reg.register(cap);
  }
  return reg;
}
