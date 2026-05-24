/**
 * Unit tests for the `dns.lookup` grant: scope check, private-IP filter,
 * family argument, multi-record handling.
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import { GrantRegistry } from '@brika/grants';
import { buildLookupGrant, type DnsLookupResolver } from '../lookup';

const PUBLIC_V4 = [8, 8, 8, 8].join('.');
const LOOPBACK_V4 = [127, 0, 0, 1].join('.');
const PRIVATE_V4 = [10, 0, 0, 1].join('.');

const handlerCtx = (scope: unknown) => ({
  pluginUid: 'p1',
  pluginRoot: '/nonexistent/plug',
  grantedScope: scope,
  log: () => {},
  signal: new AbortController().signal,
});

function registry(resolver: DnsLookupResolver) {
  const reg = new GrantRegistry();
  reg.register(buildLookupGrant(resolver));
  return reg;
}

describe('dns.lookup', () => {
  test('returns public addresses verbatim, drops private ones', async () => {
    const resolver: DnsLookupResolver = async () => [
      { address: PUBLIC_V4, family: 4 },
      { address: PRIVATE_V4, family: 4 },
    ];
    const reg = registry(resolver);
    const result = await reg.dispatch(
      'dev.brika.dns.lookup',
      { hostname: 'api.example.com', family: 0 },
      handlerCtx({ allow: ['api.example.com'] })
    );
    expect(result).toMatchObject({
      addresses: [{ address: PUBLIC_V4, family: 4 }],
    });
  });

  test('returns empty array if every record was private', async () => {
    const resolver: DnsLookupResolver = async () => [
      { address: LOOPBACK_V4, family: 4 },
      { address: '::1', family: 6 },
    ];
    const reg = registry(resolver);
    const result = await reg.dispatch(
      'dev.brika.dns.lookup',
      { hostname: 'api.example.com', family: 0 },
      handlerCtx({ allow: ['api.example.com'] })
    );
    expect(result).toMatchObject({ addresses: [] });
  });

  test('throws NET_HOST_NOT_ALLOWED when hostname is outside scope', async () => {
    const resolver: DnsLookupResolver = async () => [{ address: PUBLIC_V4, family: 4 }];
    const reg = registry(resolver);
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.dns.lookup',
        { hostname: 'attacker.example', family: 0 },
        handlerCtx({ allow: ['api.example.com'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_HOST_NOT_ALLOWED');
  });

  test('honours `*.suffix` wildcard for the queried hostname', async () => {
    const resolver: DnsLookupResolver = async () => [{ address: PUBLIC_V4, family: 4 }];
    const reg = registry(resolver);
    const result = await reg.dispatch(
      'dev.brika.dns.lookup',
      { hostname: 'foo.example.com', family: 0 },
      handlerCtx({ allow: ['*.example.com'] })
    );
    expect(result).toMatchObject({ addresses: [{ address: PUBLIC_V4 }] });
  });

  test('passes family argument through to the resolver', async () => {
    let seenFamily: 0 | 4 | 6 | undefined;
    const resolver: DnsLookupResolver = async (_host, family) => {
      seenFamily = family;
      return [];
    };
    const reg = registry(resolver);
    await reg.dispatch(
      'dev.brika.dns.lookup',
      { hostname: 'api.example.com', family: 6 },
      handlerCtx({ allow: ['api.example.com'] })
    );
    expect(seenFamily).toBe(6);
  });
});
