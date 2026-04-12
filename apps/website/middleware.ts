import { type NextRequest, NextResponse } from 'next/server';

/**
 * Forward Cloudflare geolocation data as request headers so that
 * server components can read them via `headers()`.
 *
 * Cloudflare exposes geo properties on `request.cf` (latitude, longitude, city).
 * These are not available as standard HTTP headers, so we copy them into
 * custom `x-geo-*` headers here.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const cf = (request as NextRequest & { cf?: IncomingRequestCfProperties }).cf;
  if (cf) {
    if (cf.latitude) response.headers.set('x-geo-latitude', cf.latitude);
    if (cf.longitude) response.headers.set('x-geo-longitude', cf.longitude);
    if (cf.city) response.headers.set('x-geo-city', encodeURIComponent(cf.city));
  }

  return response;
}

/** Only run on the homepage where weather data is used. */
export const config = {
  matcher: '/',
};

/** Cloudflare `request.cf` geo properties (subset used here). */
interface IncomingRequestCfProperties {
  latitude?: string;
  longitude?: string;
  city?: string;
}
