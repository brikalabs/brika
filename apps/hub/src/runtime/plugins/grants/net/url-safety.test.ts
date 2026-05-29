/**
 * Protocol allow-list — rejects everything except http(s).
 *
 * The host allow-list alone is not enough: `file:///etc/passwd` parses to
 * an empty hostname which would also fail the host check by accident, but
 * relying on that accident is fragile. Explicit protocol gating gives a
 * clean error code and survives URL-parser quirks.
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import { assertSafeUrl } from './url-safety';

describe('assertSafeUrl', () => {
  test('accepts http and https', () => {
    expect(assertSafeUrl('http://example.com').toString()).toBe('http://example.com/');
    expect(assertSafeUrl('https://example.com').toString()).toBe('https://example.com/');
  });

  test('rejects file:// with NET_PROTOCOL_BLOCKED', () => {
    let thrown: BrikaError | undefined;
    try {
      assertSafeUrl('file:///etc/passwd');
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_PROTOCOL_BLOCKED');
    expect(thrown?.data).toEqual({ protocol: 'file:' });
  });

  test('rejects data:, gopher:, ftp:, ws:, javascript:', () => {
    for (const url of [
      'data:text/plain,hi',
      'gopher://host/x',
      'ftp://host/x',
      'ws://host/x',
      'javascript:alert(1)',
    ]) {
      let thrown: BrikaError | undefined;
      try {
        assertSafeUrl(url);
      } catch (e) {
        if (e instanceof BrikaError) {
          thrown = e;
        }
      }
      expect(thrown?.code).toBe('NET_PROTOCOL_BLOCKED');
    }
  });

  test('returns parsed URL for caller reuse', () => {
    const url = assertSafeUrl('https://example.com/path?q=1');
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('example.com');
    expect(url.pathname).toBe('/path');
    expect(url.search).toBe('?q=1');
  });

  test('accepts URL instance, not only string', () => {
    const input = new URL('https://example.com/');
    const out = assertSafeUrl(input);
    expect(out.protocol).toBe('https:');
  });
});
