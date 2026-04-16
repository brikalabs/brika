/**
 * Prelude Location Module
 *
 * Caches hub location and timezone from RPC calls.
 */

import type { Channel } from '@brika/ipc';
import type { HubLocationType } from '@brika/ipc/contract';
import { getHubLocation, getHubTimezone } from '@brika/ipc/contract';

export function setupLocation(channel: Channel) {
  let cachedLocation: HubLocationType | null = null;
  let locationFetched = false;
  let cachedTimezone: string | null = null;
  let timezoneFetched = false;

  return {
    async getLocation(): Promise<HubLocationType | null> {
      if (locationFetched) {
        return cachedLocation;
      }
      const result = await channel.call(getHubLocation, {});
      cachedLocation = result.location;
      locationFetched = true;
      return cachedLocation;
    },

    async getTimezone(): Promise<string | null> {
      if (timezoneFetched) {
        return cachedTimezone;
      }
      const result = await channel.call(getHubTimezone, {});
      cachedTimezone = result.timezone;
      timezoneFetched = true;
      return cachedTimezone;
    },

    /** Reset cached timezone so the next getTimezone() re-fetches from hub. */
    invalidateTimezone(): void {
      cachedTimezone = null;
      timezoneFetched = false;
    },
  };
}
