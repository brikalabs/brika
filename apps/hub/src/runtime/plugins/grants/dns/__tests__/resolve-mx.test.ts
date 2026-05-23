/**
 * Unit tests for `dns.resolveMx`.
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import { GrantRegistry } from '@brika/grants';
import { buildResolveMxGrant, type DnsMxResolver } from '../resolve-mx';

const handlerCtx = (scope: unknown) => ({
  pluginUid: 'p1',
  pluginRoot: '/nonexistent/plug',
  grantedScope: scope,
  log: () => {},
  signal: new AbortController().signal,
});

function registry(resolver: DnsMxResolver) {
  const reg = new GrantRegistry();
  reg.register(buildResolveMxGrant(resolver));
  return reg;
}

describe('dns.resolveMx', () => {
  test('returns MX records with priority preserved', async () => {
    const resolver: DnsMxResolver = async () => [
      { priority: 10, exchange: 'mx1.example.com' },
      { priority: 20, exchange: 'mx2.example.com' },
    ];
    const reg = registry(resolver);
    const result = await reg.dispatch(
      'dev.brika.dns.resolveMx',
      { hostname: 'example.com' },
      handlerCtx({ allow: ['example.com'] })
    );
    expect(result).toMatchObject({
      records: [
        { priority: 10, exchange: 'mx1.example.com' },
        { priority: 20, exchange: 'mx2.example.com' },
      ],
    });
  });

  test('rejects out-of-scope hostnames', async () => {
    const resolver: DnsMxResolver = async () => [];
    const reg = registry(resolver);
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.dns.resolveMx',
        { hostname: 'attacker.example' },
        handlerCtx({ allow: ['example.com'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_HOST_NOT_ALLOWED');
  });
});
