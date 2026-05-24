/**
 * Unit tests for `dns.resolveTxt`.
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import { GrantRegistry } from '@brika/grants';
import { buildResolveTxtGrant, type DnsTxtResolver } from '../resolve-txt';

const handlerCtx = (scope: unknown) => ({
  pluginUid: 'p1',
  pluginRoot: '/nonexistent/plug',
  grantedScope: scope,
  log: () => {},
  signal: new AbortController().signal,
});

function registry(resolver: DnsTxtResolver) {
  const reg = new GrantRegistry();
  reg.register(buildResolveTxtGrant(resolver));
  return reg;
}

describe('dns.resolveTxt', () => {
  test('returns multi-string records intact', async () => {
    const resolver: DnsTxtResolver = async () => [
      ['v=spf1', 'include:_spf.example.com', '~all'],
      ['google-site-verification=abc'],
    ];
    const reg = registry(resolver);
    const result = await reg.dispatch(
      'dev.brika.dns.resolveTxt',
      { hostname: 'example.com' },
      handlerCtx({ allow: ['example.com'] })
    );
    expect(result).toMatchObject({
      records: [['v=spf1', 'include:_spf.example.com', '~all'], ['google-site-verification=abc']],
    });
  });

  test('rejects hostnames outside scope', async () => {
    const resolver: DnsTxtResolver = async () => [];
    const reg = registry(resolver);
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.dns.resolveTxt',
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
