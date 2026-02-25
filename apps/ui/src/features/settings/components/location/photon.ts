/**
 * Photon Geocoding API Client
 *
 * Powered by Komoot/OSM — free API, no key required.
 * Used for forward (address → coordinates) and reverse (coordinates → address) geocoding.
 */

import type { HubLocation } from './hooks';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PhotonFeature {
  geometry: { coordinates: [number, number] }; // [lng, lat]
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countrycode?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatAddress(p: PhotonFeature['properties']): string {
  const parts: string[] = [];
  if (p.street) {
    parts.push(p.housenumber ? `${p.street} ${p.housenumber}` : p.street);
  } else if (p.name) {
    parts.push(p.name);
  }
  if (p.postcode && p.city) parts.push(`${p.postcode} ${p.city}`);
  else if (p.city) parts.push(p.city);
  if (p.country) parts.push(p.country);
  return parts.join(', ');
}

export function featureToLocation(f: PhotonFeature, tz: string): HubLocation {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const street = p.housenumber ? `${p.street ?? ''} ${p.housenumber}` : (p.street ?? p.name ?? '');
  return {
    latitude: lat,
    longitude: lng,
    street: street.trim(),
    city: p.city ?? '',
    state: p.state ?? '',
    postalCode: p.postcode ?? '',
    country: p.country ?? '',
    countryCode: (p.countrycode ?? '').toUpperCase(),
    formattedAddress: formatAddress(p),
    timezone: tz,
  };
}

// ── API calls ────────────────────────────────────────────────────────────────

export async function searchAddress(query: string, signal?: AbortSignal): Promise<PhotonFeature[]> {
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`, {
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as PhotonResponse;
  return data.features;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<HubLocation | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}`);
    if (!res.ok) return null;
    const data = (await res.json()) as PhotonResponse;
    const feature = data.features[0];
    if (!feature) return null;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return featureToLocation(feature, tz);
  } catch {
    return null;
  }
}
