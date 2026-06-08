/**
 * Tests for `isSecureRequest` — decides whether the session cookie may carry
 * the `Secure` attribute. Must trust an `X-Forwarded-Proto` from a
 * TLS-terminating proxy / the P2P tunnel, and fall back to the request URL's
 * own protocol otherwise (plain-HTTP LAN must stay non-Secure).
 */

import { describe, expect, test } from 'bun:test';
import { isSecureRequest } from './cookie';

function req(url: string, headers?: Record<string, string>): Request {
  return new Request(url, { headers });
}

describe('isSecureRequest', () => {
  test('trusts X-Forwarded-Proto: https from a TLS-terminating proxy', () => {
    expect(isSecureRequest(req('http://hub.local/api', { 'x-forwarded-proto': 'https' }))).toBe(
      true
    );
  });

  test('treats X-Forwarded-Proto: http as insecure even on an https URL', () => {
    expect(isSecureRequest(req('https://hub.local/api', { 'x-forwarded-proto': 'http' }))).toBe(
      false
    );
  });

  test('reads only the first hop of a comma-separated X-Forwarded-Proto', () => {
    expect(
      isSecureRequest(req('http://hub.local/api', { 'x-forwarded-proto': 'https, http' }))
    ).toBe(true);
  });

  test('falls back to the request URL protocol when no proxy header is present', () => {
    expect(isSecureRequest(req('https://hub.local/api'))).toBe(true);
    expect(isSecureRequest(req('http://hub.local/api'))).toBe(false);
  });
});
