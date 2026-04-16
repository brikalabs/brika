/**
 * Location Module
 *
 * Thin typed wrapper over the prelude's location/timezone caching.
 * The prelude handles the RPC calls and caching; the SDK adds
 * typed error mapping for PermissionDeniedError.
 */

import { rethrowRpcError } from '../errors';
import type { HubLocation } from '../types';
import { type ContextCore, registerContextModule, requireBridge } from './register';

export type { HubLocation as HubLocationData } from '../types';

// ─── Setup ───────────────────────────────────────────────────────────────────

export function setupLocation(_core: ContextCore) {
  const bridge = requireBridge();

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
      async getLocation(): Promise<HubLocation | null> {
        return bridge.getLocation().catch(rethrowRpcError);
      },

      /**
       * Get the hub's configured timezone (IANA identifier, e.g. "Europe/Zurich").
       *
       * Returns cached result on subsequent calls.
       * Returns `null` if timezone is not configured on the hub.
       */
      async getTimezone(): Promise<string | null> {
        return bridge.getTimezone().catch(rethrowRpcError);
      },
    },
  };
}

registerContextModule('location', setupLocation);
