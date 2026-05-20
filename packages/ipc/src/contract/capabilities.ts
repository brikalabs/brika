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
