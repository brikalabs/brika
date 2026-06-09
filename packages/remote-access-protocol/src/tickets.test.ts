import { describe, expect, it } from 'bun:test';
import { mintTicket, verifyTicket } from './tickets';

const SECRET = 'test-secret-please-rotate';

/**
 * Sign `header.claims` with the same HMAC-SHA256 key used by the tickets
 * module so we can produce structurally valid tickets with crafted payloads.
 */
async function signTicket(secret: string, headerB64: string, claimsB64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signingInput = `${headerB64}.${claimsB64}`;
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  // base64url-encode without padding
  let s = '';
  for (const b of new Uint8Array(sig)) {
    s += String.fromCodePoint(b);
  }
  const encoded = btoa(s).replaceAll('+', '-').replaceAll('/', '_');
  let end = encoded.length;
  while (end > 0 && encoded[end - 1] === '=') {
    end -= 1;
  }
  return `${signingInput}.${encoded.slice(0, end)}`;
}

/** base64url-encode a JSON value (no padding). */
function encodeJson(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let s = '';
  for (const b of bytes) {
    s += String.fromCodePoint(b);
  }
  const encoded = btoa(s).replaceAll('+', '-').replaceAll('/', '_');
  let end = encoded.length;
  while (end > 0 && encoded[end - 1] === '=') {
    end -= 1;
  }
  return encoded.slice(0, end);
}

describe('tickets', () => {
  it('mints a ticket that verifies under the same secret', async () => {
    const { ticket } = await mintTicket(SECRET, 'maxime');
    const claims = await verifyTicket(SECRET, ticket);
    expect(claims).not.toBeNull();
    expect(claims?.hub).toBe('maxime');
  });

  it('rejects a ticket signed with a different secret', async () => {
    const { ticket } = await mintTicket(SECRET, 'maxime');
    expect(await verifyTicket('different-secret', ticket)).toBeNull();
  });

  it('rejects malformed tickets', async () => {
    expect(await verifyTicket(SECRET, 'not.a.token')).toBeNull();
    expect(await verifyTicket(SECRET, 'one-part')).toBeNull();
    expect(await verifyTicket(SECRET, '')).toBeNull();
  });

  it('rejects a ticket with a wrong/forged header', async () => {
    const { ticket } = await mintTicket(SECRET, 'maxime');
    const [, claims, sig] = ticket.split('.') as [string, string, string];
    const tampered = `eyJ2IjoyfQ.${claims}.${sig}`; // header = { v: 2 }
    expect(await verifyTicket(SECRET, tampered)).toBeNull();
  });

  it('rejects a ticket with an unparseable claims body', async () => {
    const { ticket } = await mintTicket(SECRET, 'maxime');
    const [h, , sig] = ticket.split('.') as [string, string, string];
    // Need a body that decodes to invalid JSON. Re-encode '???' which is valid
    // base64url but yields non-JSON bytes.
    const broken = btoa('???').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    expect(await verifyTicket(SECRET, `${h}.${broken}.${sig}`)).toBeNull();
  });

  it('rejects a ticket whose decoded claims are missing required fields', async () => {
    // We can't HMAC-sign this directly with the public mintTicket, so just
    // verify that a forged body still fails the signature check first.
    const fake = 'eyJ2IjoxLCJhbGciOiJIUzI1NiJ9.eyJodWIiOiJtYXgifQ.AAAA';
    expect(await verifyTicket(SECRET, fake)).toBeNull();
  });

  // The following two tests produce validly-signed tickets with crafted payloads
  // to exercise the post-HMAC defensive guards in verifyTicket.

  it('rejects a validly-signed ticket with unparseable JSON in the claims part', async () => {
    // Produce a base64url segment whose bytes decode to something that is NOT
    // valid JSON (raw bytes 0x00 0x01 0x02 are not a JSON string).
    const badBytes = new Uint8Array([0x00, 0x01, 0x02]);
    let s = '';
    for (const b of badBytes) {
      s += String.fromCodePoint(b);
    }
    const claimsB64 = btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const HEADER_B64 = 'eyJ2IjoxLCJhbGciOiJIUzI1NiJ9';
    const ticket = await signTicket(SECRET, HEADER_B64, claimsB64);
    expect(await verifyTicket(SECRET, ticket)).toBeNull();
  });

  it('rejects a validly-signed ticket whose claims lack the hub or exp fields', async () => {
    // claims object is valid JSON but missing exp (number) — fails the type guard.
    const HEADER_B64 = 'eyJ2IjoxLCJhbGciOiJIUzI1NiJ9';
    const missingExp = encodeJson({ hub: 'maxime', nonce: 'abc' });
    const ticket = await signTicket(SECRET, HEADER_B64, missingExp);
    expect(await verifyTicket(SECRET, ticket)).toBeNull();
  });

  it('rejects a validly-signed ticket that has already expired', async () => {
    // Use signTicket to produce a properly-signed ticket with exp in the past.
    const HEADER_B64 = 'eyJ2IjoxLCJhbGciOiJIUzI1NiJ9';
    const expiredClaims = encodeJson({ hub: 'maxime', exp: 1, nonce: 'test-nonce' });
    const ticket = await signTicket(SECRET, HEADER_B64, expiredClaims);
    expect(await verifyTicket(SECRET, ticket)).toBeNull();
  });

  it('rejects an expired ticket', async () => {
    const { ticket } = await mintTicket(SECRET, 'maxime');
    // Tamper with the encoded claims to force exp=0.
    const [h, _claims, sig] = ticket.split('.') as [string, string, string];
    const encoded = btoa(JSON.stringify({ hub: 'maxime', exp: 0, nonce: 'x' }))
      .replaceAll('+', '-')
      .replaceAll('/', '_');
    let end = encoded.length;
    while (end > 0 && encoded[end - 1] === '=') {
      end -= 1;
    }
    const expired = `${h}.${encoded.slice(0, end)}.${sig}`;
    expect(await verifyTicket(SECRET, expired)).toBeNull();
  });
});
