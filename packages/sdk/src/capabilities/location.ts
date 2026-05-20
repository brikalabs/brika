/**
 * Location capability specs.
 *
 * Two always-on capabilities (no permission gate yet — the legacy "location"
 * permission gates this domain via the deprecated bridge until the manifest
 * schema lands the per-capability grant model). When the new manifest format
 * ships, swap `permission: undefined` for a real gate.
 *
 * The handler lives in `apps/hub/src/runtime/plugins/capabilities/location.ts`;
 * this file defines only the spec (so it can be imported from both sides) and
 * the Ctx augmentation (so plugin types see `ctx.location.get()` etc.).
 */

import { defineCapability } from '@brika/capabilities';
import { z } from 'zod';

const LocationShape = z.object({
  latitude: z.number(),
  longitude: z.number(),
  street: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.string(),
  countryCode: z.string(),
  formattedAddress: z.string(),
});

/** Hub's stored location — what the user configured under Settings. */
export const locationGet = defineCapability(
  {
    id: 'location.get',
    args: z.object({}),
    result: z.object({ location: LocationShape.nullable() }),
    description: "Read the hub's configured location",
    permission: {
      name: 'location',
      scope: z.object({}),
      defaultScope: {},
      icon: 'map-pin',
    },
  },
  // Handler is registered in the hub; the spec lives here. The throw is a
  // safety net — if anyone ever dispatches against this spec without
  // re-binding it to a real handler, the test boundary will catch it.
  () => {
    throw new Error(
      'location.get handler is not registered. The hub must register a handler before plugin code can call ctx.location.get().'
    );
  }
);

/** Hub's configured timezone (IANA identifier). */
export const locationTimezone = defineCapability(
  {
    id: 'location.timezone',
    args: z.object({}),
    result: z.object({ timezone: z.string().nullable() }),
    description: "Read the hub's configured timezone (IANA, e.g. Europe/Zurich)",
  },
  () => {
    throw new Error(
      'location.timezone handler is not registered. The hub must register a handler before plugin code can call ctx.location.timezone().'
    );
  }
);

// ─── Ctx augmentation ────────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    location: {
      /**
       * Read the hub's configured location.
       *
       * Requires the `location` permission. Throws `PermissionDeniedError`
       * at the SDK boundary if the user has not granted it.
       */
      get(args?: Record<string, never>): Promise<{ location: z.infer<typeof LocationShape> | null }>;

      /** Read the hub's configured timezone (IANA, e.g. Europe/Zurich). */
      timezone(args?: Record<string, never>): Promise<{ timezone: string | null }>;
    };
  }
}
