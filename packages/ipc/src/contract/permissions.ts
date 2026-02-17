/**
 * Permissions Contract
 *
 * RPCs for plugin permission data requests.
 */

import { z } from 'zod';
import { rpc } from '../define';

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const HubLocation = z.object({
  latitude: z.number(),
  longitude: z.number(),
  street: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.string(),
  countryCode: z.string(),
  formattedAddress: z.string(),
  timezone: z.string(),
});
export type HubLocation = z.infer<typeof HubLocation>;

// ─── RPCs ────────────────────────────────────────────────────────────────────

/**
 * Plugin requests the hub's stored location (requires "location" permission).
 *
 * @throws {RpcError} code `PERMISSION_DENIED` if the plugin lacks the grant.
 */
export const getHubLocation = rpc(
  'getHubLocation',
  z.object({}),
  z.object({
    location: HubLocation.nullable(),
  })
);
