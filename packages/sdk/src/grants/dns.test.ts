/**
 * Unit tests for `grants/dns.ts` — verifies schema shapes, the shared
 * permission gate, and that the SDK-side placeholder handler / redact
 * hooks behave as documented.
 */

import { describe, expect, test } from 'bun:test';
import {
  DnsLookupArgsSchema,
  DnsLookupResultSchema,
  DnsResolveMxArgsSchema,
  DnsResolveMxResultSchema,
  DnsResolveTxtArgsSchema,
  DnsResolveTxtResultSchema,
  DnsScopeSchema,
  dnsLookup,
  dnsResolveMx,
  dnsResolveTxt,
} from './dns';

const stubHandlerCtx = {
  pluginUid: 'plugin-x',
  pluginRoot: '/plugins/x',
  grantedScope: { allow: [] },
  log: () => undefined,
  signal: new AbortController().signal,
};

describe('DnsScopeSchema', () => {
  test('parses an allow-list', () => {
    expect(DnsScopeSchema.parse({ allow: ['a.example', '*.b.example'] })).toEqual({
      allow: ['a.example', '*.b.example'],
    });
  });

  test('rejects non-string entries', () => {
    expect(() => DnsScopeSchema.parse({ allow: [42] })).toThrow();
  });
});

describe('dns.lookup spec', () => {
  test('defaults family to 0', () => {
    expect(DnsLookupArgsSchema.parse({ hostname: 'a.example' })).toEqual({
      hostname: 'a.example',
      family: 0,
    });
  });

  test('accepts family 4 and 6 only (plus 0)', () => {
    for (const family of [0, 4, 6] as const) {
      expect(DnsLookupArgsSchema.parse({ hostname: 'a', family }).family).toBe(family);
    }
    expect(() => DnsLookupArgsSchema.parse({ hostname: 'a', family: 5 })).toThrow();
  });

  test('result schema parses both v4 + v6 entries', () => {
    // 192.0.2.0/24 is RFC 5737 TEST-NET-1 — never routed, safe as a fixture.
    expect(
      DnsLookupResultSchema.parse({
        addresses: [
          { address: '192.0.2.1', family: 4 },
          { address: '::1', family: 6 },
        ],
      }).addresses
    ).toHaveLength(2);
  });

  test('hostname length is bounded', () => {
    expect(() => DnsLookupArgsSchema.parse({ hostname: '' })).toThrow();
    expect(() => DnsLookupArgsSchema.parse({ hostname: 'a'.repeat(254) })).toThrow();
  });

  test('redact.result summarises addressCount', () => {
    const summary = dnsLookup.spec.redact?.result?.({
      addresses: [
        { address: '192.0.2.1', family: 4 },
        { address: '::1', family: 6 },
      ],
    });
    expect(summary).toEqual({ addressCount: 2 });
  });

  test('SDK-side handler throws so accidental dispatch is loud', () => {
    expect(() => dnsLookup.handler(stubHandlerCtx, { hostname: 'a.example', family: 0 })).toThrow(
      /SDK-side handler invoked/
    );
  });

  test('spec carries shared dns permission gate', () => {
    expect(dnsLookup.spec.permission?.name).toBe('dns');
    expect(dnsLookup.spec.permission?.icon).toBe('globe-2');
  });
});

describe('dns.resolveTxt spec', () => {
  test('args + result schemas round-trip', () => {
    expect(DnsResolveTxtArgsSchema.parse({ hostname: 'a' })).toEqual({ hostname: 'a' });
    expect(
      DnsResolveTxtResultSchema.parse({
        records: [['v=spf1', '-all']],
      }).records
    ).toEqual([['v=spf1', '-all']]);
  });

  test('redact.result summarises recordCount without leaking values', () => {
    const summary = dnsResolveTxt.spec.redact?.result?.({
      records: [['v=spf1', '-all'], ['extra']],
    });
    expect(summary).toEqual({ recordCount: 2 });
  });

  test('SDK-side handler throws', () => {
    expect(() => dnsResolveTxt.handler(stubHandlerCtx, { hostname: 'a.example' })).toThrow(
      /SDK-side handler invoked/
    );
  });
});

describe('dns.resolveMx spec', () => {
  test('args + result schemas round-trip', () => {
    expect(DnsResolveMxArgsSchema.parse({ hostname: 'a' })).toEqual({ hostname: 'a' });
    expect(
      DnsResolveMxResultSchema.parse({
        records: [{ priority: 10, exchange: 'mx1.example' }],
      }).records
    ).toHaveLength(1);
  });

  test('rejects negative priority', () => {
    expect(() =>
      DnsResolveMxResultSchema.parse({
        records: [{ priority: -1, exchange: 'mx1.example' }],
      })
    ).toThrow();
  });

  test('redact.result summarises recordCount', () => {
    const summary = dnsResolveMx.spec.redact?.result?.({
      records: [
        { priority: 10, exchange: 'mx1.example' },
        { priority: 20, exchange: 'mx2.example' },
      ],
    });
    expect(summary).toEqual({ recordCount: 2 });
  });

  test('SDK-side handler throws', () => {
    expect(() => dnsResolveMx.handler(stubHandlerCtx, { hostname: 'a.example' })).toThrow(
      /SDK-side handler invoked/
    );
  });
});
