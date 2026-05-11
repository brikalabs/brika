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

  it('rejects an expired ticket', async () => {
    const { ticket } = await mintTicket(SECRET, 'maxime');
    // Tamper with the encoded claims to force exp=0.
    const [h, _claims, sig] = ticket.split('.') as [string, string, string];
    const expired = `${h}.${btoa(JSON.stringify({ hub: 'maxime', exp: 0, nonce: 'x' }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')}.${sig}`;
    expect(await verifyTicket(SECRET, expired)).toBeNull();
  });
});
