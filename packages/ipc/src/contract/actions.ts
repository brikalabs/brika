/**
 * Actions Contract
 *
 * Plugin-defined server-side actions: registration and invocation.
 */

import { z } from 'zod';
import { message, rpc } from '../define';
import { Json } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Messages & RPCs
// ─────────────────────────────────────────────────────────────────────────────

/** Plugin registers an action with the hub */
export const registerAction = message(
  'registerAction',
  z.object({
    id: z.string(),
  })
);

/**
 * Hub calls an action on the plugin.
 *
 * Plugin executes the handler and returns `{ ok, data?, error? }`.
 */
export const callAction = rpc(
  'callAction',
  z.object({
    actionId: z.string(),
    input: Json.optional(),
  }),
  z.object({
    ok: z.boolean(),
    data: Json.optional(),
    error: z.string().optional(),
  })
);
