/**
 * Capability RPC contract.
 *
 * One RPC primitive carries every capability call across the wire. Per-
 * capability Zod validation happens INSIDE the dispatcher (the
 * @brika/capabilities `CapabilityRegistry`), not at the channel layer, so
 * adding or removing a capability does not touch this file.
 *
 * The wire payload is intentionally schema-light: `args` and the result
 * body are `unknown`. The registry validates both ends. This keeps
 * @brika/ipc independent of the capability catalog.
 */

import { z } from 'zod';
import { Json } from '../types';
import { rpc } from '../define';

/** Capability invocation: plugin -> hub. */
export const capabilityRequest = rpc(
  'capability.request',
  z.object({
    /** Capability id, e.g. `'net.fetch'`, `'secrets.get'`. */
    id: z.string(),
    /** Capability-specific arguments — validated by the registry, not here. */
    args: Json,
  }),
  z.object({
    /** Capability-specific result — validated by the registry, not here. */
    result: Json,
  })
);

/**
 * Plugin -> hub: fetch the capability vector at startup.
 *
 * The vector is the immutable snapshot of what the plugin has been granted
 * for its lifetime. The prelude calls this once at startup before plugin
 * code runs, installs the result via `installVector()`, and uses it to
 * build the typed `ctx` object.
 *
 * A future T2 sandbox iteration will let the hub push vector updates over
 * an event so users can hot-revoke a permission without restarting the
 * plugin; for now the vector is static across the plugin's lifetime.
 */
export const getCapabilityVector = rpc(
  'capability.vector.get',
  z.object({}),
  z.object({
    grants: z.array(
      z.object({
        id: z.string(),
        scope: Json.optional(),
      })
    ),
  })
);
