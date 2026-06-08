import { getAuthConfig } from '../../config';

/**
 * Whether the request reached the hub over a secure transport: direct HTTPS, or
 * via a TLS-terminating proxy / the P2P DTLS tunnel (surfaced as X-Forwarded-Proto).
 *
 * The session cookie must NOT carry `Secure` over plain-HTTP LAN (the documented
 * `brika start --host 0.0.0.0` setup), or browsers drop it and the user can never
 * stay logged in.
 */
export function isSecureRequest(req: Request): boolean {
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0]?.trim() === 'https';
  }
  return new URL(req.url).protocol === 'https:';
}

/** Build a Set-Cookie header value for the session token. */
export function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  const name = getAuthConfig().session.cookieName;
  const secureAttr = secure ? ' Secure;' : '';
  return `${name}=${token}; HttpOnly;${secureAttr} Path=/api; Max-Age=${maxAge}; SameSite=Lax`;
}
