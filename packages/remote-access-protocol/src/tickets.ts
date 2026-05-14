/**
 * Short-lived signed tickets for browser-side signaling auth.
 *
 * Format: base64url(header).base64url(claims).base64url(hmac)
 *   header  = { v: 1, alg: 'HS256' }
 *   claims  = { hub: string, exp: number, nonce: string }
 *
 * Stateless — the coordinator can validate without a database lookup. The
 * HMAC secret rotates by deploying a new value and accepting both for a
 * grace period (not implemented in v0; just one secret).
 *
 * Tickets are short-lived (60s) so a leaked ticket is essentially unusable.
 */

const TICKET_TTL_SECONDS = 60;

export interface TicketClaims {
  /** Hub name the ticket authorizes a connection attempt to. */
  readonly hub: string;
  /** Unix epoch seconds at which this ticket expires. */
  readonly exp: number;
  /** Random per-ticket nonce — defends against accidental reuse. */
  readonly nonce: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) {
    s += String.fromCodePoint(b);
  }
  // Trim trailing '=' padding without a regex — keeps Sonar's regex-DoS
  // analyzer happy and avoids any chance of pathological backtracking on
  // adversarial inputs.
  const encoded = btoa(s).replaceAll('+', '-').replaceAll('/', '_');
  let end = encoded.length;
  while (end > 0 && encoded[end - 1] === '=') {
    end -= 1;
  }
  return end === encoded.length ? encoded : encoded.slice(0, end);
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.codePointAt(i) ?? 0;
  }
  return out;
}

const HEADER = { v: 1, alg: 'HS256' as const };
const HEADER_B64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(HEADER)));

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Mint a fresh ticket bound to a given hub name. */
export async function mintTicket(
  secret: string,
  hubName: string
): Promise<{
  ticket: string;
  expiresAt: number;
  claims: TicketClaims;
}> {
  const exp = Math.floor(Date.now() / 1000) + TICKET_TTL_SECONDS;
  const nonce = base64UrlEncode(crypto.getRandomValues(new Uint8Array(12)));
  const claims: TicketClaims = { hub: hubName, exp, nonce };
  const claimsB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${HEADER_B64}.${claimsB64}`;

  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));

  return {
    ticket: `${signingInput}.${sigB64}`,
    expiresAt: exp,
    claims,
  };
}

/** Verify a ticket and return its claims, or `null` if invalid/expired. */
export async function verifyTicket(secret: string, ticket: string): Promise<TicketClaims | null> {
  const parts = ticket.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [headerB64, claimsB64, sigB64] = parts as [string, string, string];
  if (headerB64 !== HEADER_B64) {
    return null;
  }

  const key = await importHmacKey(secret);
  // Copy into a fresh ArrayBuffer — crypto.subtle.verify under strict typings
  // doesn't accept Uint8Array views backed by SharedArrayBuffer-aware buffers.
  const sigBytes = base64UrlDecode(sigB64);
  const sigBuf = new ArrayBuffer(sigBytes.byteLength);
  new Uint8Array(sigBuf).set(sigBytes);
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBuf,
    new TextEncoder().encode(`${headerB64}.${claimsB64}`)
  );
  if (!ok) {
    return null;
  }

  let claims: TicketClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(claimsB64))) as TicketClaims;
  } catch {
    return null;
  }
  if (typeof claims.hub !== 'string' || typeof claims.exp !== 'number') {
    return null;
  }
  if (claims.exp * 1000 < Date.now()) {
    return null;
  }
  return claims;
}
