/**
 * Hub Location API
 *
 * Requests the hub's stored location via IPC.
 * Requires "location" permission in plugin package.json.
 *
 * @example
 * ```typescript
 * import { getDeviceLocation, PermissionDeniedError } from '@brika/sdk';
 *
 * try {
 *   const loc = await getDeviceLocation();
 *   if (loc) {
 *     console.log(`Located in ${loc.city}, ${loc.country}`);
 *   }
 * } catch (err) {
 *   if (err instanceof PermissionDeniedError) {
 *     console.log('Location permission not granted');
 *   }
 * }
 * ```
 */

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
  formattedAddress: string;
}

/**
 * Get the hub's configured location.
 *
 * Returns cached result on subsequent calls. Returns `null` if location
 * is not configured on the hub.
 *
 * Use this in plugin lifecycle hooks (`onInit`, block handlers, action
 * handlers). Inside brick render functions, prefer the context-bound
 * `getLocation()` from `@brika/sdk/brick-views` — it ties into the
 * render-cycle re-evaluation.
 *
 * @throws {PermissionDeniedError} if the "location" permission is not granted.
 *   Add `"permissions": ["location"]` to your plugin's package.json.
 */
export async function getDeviceLocation(): Promise<DeviceLocation | null> {
  // Lazy import to avoid circular deps and ensure context is initialized
  const { getContext } = await import('../context');
  const ctx = getContext();
  return ctx.getLocation();
}
