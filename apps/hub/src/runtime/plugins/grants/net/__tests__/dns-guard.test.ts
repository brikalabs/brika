/**
 * DNS rebinding / private-IP filter.
 *
 * Resolver is stubbed deterministically — no real DNS query crosses the
 * test boundary. Each test sets up the answers the guard will see and
 * checks that the right category is logged in the thrown error.
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import { assertPublicHost, classifyIp } from '../dns-guard';

const PUBLIC_IPV4 = [8, 8, 8, 8].join('.');

describe('classifyIp — IPv4', () => {
  test('rejects 10/8, 172.16/12, 192.168/16 (RFC1918)', () => {
    expect(classifyIp([10, 0, 0, 1].join('.'))).toBe('rfc1918-10');
    expect(classifyIp([172, 16, 0, 1].join('.'))).toBe('rfc1918-172');
    expect(classifyIp([172, 31, 255, 254].join('.'))).toBe('rfc1918-172');
    expect(classifyIp([192, 168, 1, 1].join('.'))).toBe('rfc1918-192');
  });

  test('accepts 172.15/16 and 172.32/16 (outside the /12)', () => {
    expect(classifyIp([172, 15, 0, 1].join('.'))).toBeNull();
    expect(classifyIp([172, 32, 0, 1].join('.'))).toBeNull();
  });

  test('rejects 127/8 loopback', () => {
    expect(classifyIp([127, 0, 0, 1].join('.'))).toBe('loopback');
    expect(classifyIp([127, 1, 2, 3].join('.'))).toBe('loopback');
  });

  test('rejects 169.254/16 link-local (incl. AWS metadata)', () => {
    expect(classifyIp([169, 254, 169, 254].join('.'))).toBe('link-local');
  });

  test('rejects multicast 224-239 and reserved 240+', () => {
    expect(classifyIp([224, 0, 0, 1].join('.'))).toBe('multicast');
    expect(classifyIp([239, 255, 255, 255].join('.'))).toBe('multicast');
    expect(classifyIp([240, 0, 0, 1].join('.'))).toBe('reserved');
    expect(classifyIp([255, 255, 255, 255].join('.'))).toBe('reserved');
  });

  test('rejects 0/8 unspecified', () => {
    expect(classifyIp([0, 0, 0, 0].join('.'))).toBe('unspecified');
  });

  test('rejects documentation ranges', () => {
    expect(classifyIp([192, 0, 2, 1].join('.'))).toBe('rfc5737-documentation');
    expect(classifyIp([198, 51, 100, 1].join('.'))).toBe('rfc5737-documentation');
    expect(classifyIp([203, 0, 113, 1].join('.'))).toBe('rfc5737-documentation');
  });

  test('accepts ordinary public IPs', () => {
    expect(classifyIp(PUBLIC_IPV4)).toBeNull();
    expect(classifyIp([1, 1, 1, 1].join('.'))).toBeNull();
    expect(classifyIp([13, 32, 86, 100].join('.'))).toBeNull();
  });

  test('rejects malformed IPv4 with leading zeros (octal-style)', () => {
    // 010.0.0.1 in octal would be 8.0.0.1; refuse the ambiguity entirely.
    expect(classifyIp('010.0.0.1')).toBe('unparseable');
  });

  test('rejects out-of-range octets', () => {
    expect(classifyIp('256.0.0.1')).toBe('unparseable');
    expect(classifyIp('1.2.3')).toBe('unparseable');
  });
});

describe('classifyIp — IPv6', () => {
  test('rejects ::1 loopback', () => {
    expect(classifyIp('::1')).toBe('loopback');
  });

  test('rejects fe80::/10 link-local', () => {
    expect(classifyIp('fe80::1')).toBe('ipv6-link-local');
    expect(classifyIp('febf::1')).toBe('ipv6-link-local');
  });

  test('rejects fc00::/7 unique-local', () => {
    expect(classifyIp('fc00::1')).toBe('ipv6-unique-local');
    expect(classifyIp('fdff::1')).toBe('ipv6-unique-local');
  });

  test('rejects multicast ff00::/8', () => {
    expect(classifyIp('ff02::1')).toBe('ipv6-multicast');
  });

  test('rejects ::/128 unspecified', () => {
    expect(classifyIp('::')).toBe('unspecified');
  });

  test('reclassifies IPv4-mapped via the embedded IPv4', () => {
    expect(classifyIp('::ffff:127.0.0.1')).toBe('loopback');
    expect(classifyIp('::ffff:10.0.0.1')).toBe('rfc1918-10');
    expect(classifyIp(`::ffff:${PUBLIC_IPV4}`)).toBeNull();
  });

  test('accepts ordinary public IPv6', () => {
    expect(classifyIp('2001:4860:4860::8888')).toBeNull();
  });

  test('handles bracketed form (URL hostname style)', () => {
    expect(classifyIp('[::1]')).toBe('loopback');
  });
});

describe('assertPublicHost', () => {
  test('passes for a single public answer', async () => {
    await expect(
      assertPublicHost('example.com', async () => [PUBLIC_IPV4])
    ).resolves.toBeUndefined();
  });

  test('blocks if ANY answer is private (multi-A poisoning)', async () => {
    let thrown: BrikaError | undefined;
    try {
      await assertPublicHost('rebind.example', async () => [PUBLIC_IPV4, [127, 0, 0, 1].join('.')]);
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_PRIVATE_IP_BLOCKED');
    expect(thrown?.data).toMatchObject({ host: 'rebind.example', category: 'loopback' });
  });

  test('blocks literal private host without consulting resolver', async () => {
    let resolverCalled = false;
    const resolver = async () => {
      resolverCalled = true;
      return [PUBLIC_IPV4];
    };
    let thrown: BrikaError | undefined;
    try {
      await assertPublicHost([127, 0, 0, 1].join('.'), resolver);
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_PRIVATE_IP_BLOCKED');
    expect(resolverCalled).toBe(false);
  });

  test('passes literal public host without consulting resolver', async () => {
    let resolverCalled = false;
    const resolver = async () => {
      resolverCalled = true;
      return [PUBLIC_IPV4];
    };
    await expect(assertPublicHost(PUBLIC_IPV4, resolver)).resolves.toBeUndefined();
    expect(resolverCalled).toBe(false);
  });

  test('public hostname with link-local answer → blocked, category surfaced', async () => {
    let thrown: BrikaError | undefined;
    try {
      await assertPublicHost('metadata.example', async () => [[169, 254, 169, 254].join('.')]);
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.data).toMatchObject({
      host: 'metadata.example',
      category: 'link-local',
    });
  });
});
