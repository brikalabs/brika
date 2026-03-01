/**
 * Location Module
 *
 * Provides hub location data to plugins via IPC RPC.
 * Requires "location" permission in plugin package.json.
 */

import { getHubLocation } from '@brika/ipc/contract';
import { rethrowRpcError } from '../errors';
import type { ContextCore } from './register';
import { registerContextModule } from './register';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HubLocationData {
  latitude: number;
  longitude: number;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
  formattedAddress: string;
  timezone: string;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

export function setupLocation(core: ContextCore) {
  const { client } = core;
  let cached: HubLocationData | null = null;
  let fetched = false;

  return {
    methods: {
      /**
       * Get the hub's configured location.
       *
       * Returns cached result on subsequent calls.
       * Returns `null` if location is not configured on the hub.
       *
       * @throws {PermissionDeniedError} if the "location" permission is not granted
       */
      async getLocation(): Promise<HubLocationData | null> {
        if (fetched) {
          return cached;
        }
        const result = await client.call(getHubLocation, {}).catch(rethrowRpcError);
        cached = result.location;
        fetched = true;
        return cached;
      },
    },
  };
}

registerContextModule('location', setupLocation);
