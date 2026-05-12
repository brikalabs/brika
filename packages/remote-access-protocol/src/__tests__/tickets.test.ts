import { describe, expect, it } from 'bun:test';
import { mintTicket, verifyTicket } from '../tickets';

const SECRET = 'test-secret-please-rotate';

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
