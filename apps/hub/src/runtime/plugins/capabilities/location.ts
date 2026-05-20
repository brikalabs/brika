/**
 * Hub-side handlers for the `location.*` capabilities.
 *
 * The spec is defined in `@brika/sdk/capabilities/location` (so the Ctx
 * type augmentation is visible to plugins). Here we re-define each capability
 * with the same id but bound to the hub's actual data source.
 */

import { defineCapability } from '@brika/capabilities';
import { locationGet as spec, locationTimezone as tzSpec } from '@brika/sdk/capabilities';
import type { HubLocation } from '@brika/ipc/contract';

export interface LocationCallbacks {
  getLocation(): HubLocation | null;
  getTimezone(): string | null;
}

export function buildLocationCapabilities(cb: LocationCallbacks) {
  return [
    defineCapability(spec.spec, () => ({ location: cb.getLocation() })),
    defineCapability(tzSpec.spec, () => ({ timezone: cb.getTimezone() })),
  ];
}
