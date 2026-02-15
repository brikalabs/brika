/**
 * Device Location API
 *
 * Auto-detect the device's approximate location via IP geolocation.
 * Cached for the lifetime of the process — the device location rarely changes.
 *
 * @example
 * ```typescript
 * import { getDeviceLocation } from '@brika/sdk';
 *
 * const loc = await getDeviceLocation();
 * if (loc) {
 *   console.log(`Located in ${loc.city}, ${loc.country}`);
 * }
 * ```
 */

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  timezone: string;
}

interface IpApiResponse {
  latitude: number;
  longitude: number;
  city: string;
  country_name: string;
  timezone: string;
}

let cached: DeviceLocation | null = null;
let fetched = false;

/**
 * Get the device's approximate location via IP geolocation.
 *
 * Returns cached result on subsequent calls.
 * Returns `null` if geolocation fails (network error, rate limit, etc.).
 */
export async function getDeviceLocation(): Promise<DeviceLocation | null> {
  if (fetched) return cached;

  try {
    const res = await fetch('https://ipapi.co/json/', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      fetched = true;
      return null;
    }

    const data = (await res.json()) as IpApiResponse;
    cached = {
      latitude: data.latitude,
      longitude: data.longitude,
      city: data.city,
      country: data.country_name,
      timezone: data.timezone,
    };
    fetched = true;
    return cached;
  } catch {
    fetched = true;
    return null;
  }
}
