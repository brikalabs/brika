/**
 * Re-export of the shared ticket helpers. The implementation lives in
 * `@brika/remote-access-protocol` so the Cloudflare Worker coordinator and
 * the Bun coordinator stay byte-for-byte compatible.
 */
export { mintTicket, type TicketClaims, verifyTicket } from '@brika/remote-access-protocol';
