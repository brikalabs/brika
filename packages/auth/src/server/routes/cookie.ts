import { getAuthConfig } from '../../config';

/** Build a Set-Cookie header value for the session token. */
export function sessionCookie(token: string, maxAge: number): string {
  const name = getAuthConfig().session.cookieName;
  return `${name}=${token}; HttpOnly; Secure; Path=/api; Max-Age=${maxAge}; SameSite=Lax`;
}
