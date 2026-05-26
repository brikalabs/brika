/**
 * `dev.brika.location.get` — hub-mediated hub location read.
 *
 * The hub stores a single operator-configured location (used by weather,
 * sunrise/sunset, geofencing, etc.). This grant gates plugin reads. The
 * actual dispatch still flows through the `getHubLocation` RPC for now;
 * the grant entry exists so the manifest unification reads the same
 * registry the runtime checks.
 */

import { defineGrant, type PermissionGate } from '@brika/grants';
import { z } from 'zod';

export const LocationScopeSchema = z.object({}).strict();
export type LocationScope = z.infer<typeof LocationScopeSchema>;

const LocationPermission: PermissionGate<typeof LocationScopeSchema> = {
  name: 'location',
  scope: LocationScopeSchema,
  defaultScope: {},
  icon: 'map-pin',
};

export const LocationGetArgsSchema = z.object({});
export const LocationGetResultSchema = z.object({
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      street: z.string(),
      city: z.string(),
      state: z.string(),
      postalCode: z.string(),
      country: z.string(),
      countryCode: z.string(),
      formattedAddress: z.string(),
    })
    .nullable(),
});

export type LocationGetArgs = z.infer<typeof LocationGetArgsSchema>;
export type LocationGetResult = z.infer<typeof LocationGetResultSchema>;

export const locationGet = defineGrant(
  {
    id: 'dev.brika.location.get',
    args: LocationGetArgsSchema,
    result: LocationGetResultSchema,
    permission: LocationPermission,
    description: 'Read the hub-configured location.',
  },
  () => {
    throw new Error('location.get: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);
