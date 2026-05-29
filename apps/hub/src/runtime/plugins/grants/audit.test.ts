/**
 * Integration test: the hub's `buildHubGrants` wires the audit logger
 * into every registered grant, and the SDK-side `redact` hooks (added
 * to net.fetch and dns.lookup) shape the audit payload as expected.
 *
 * Same loopback approach as the proxy tests — the hub registry runs
 * against a mock fetcher and a stub DNS resolver.
 */

import { describe, expect, test } from 'bun:test';
import type { AuditEntry } from '@brika/grants';
import type { NetCallbacks } from './net';
import type { DnsResolver } from './net/dns-guard';
import { buildHubGrants } from './registry-factory';

const PUBLIC_IP = [8, 8, 8, 8].join('.');
const PUBLIC_RESOLVER: DnsResolver = async () => [PUBLIC_IP];

const handlerCtx = (scope: unknown) => ({
  pluginUid: 'plug-audit-1',
  pluginRoot: '/nonexistent/plug',
  grantedScope: scope,
  log: () => {},
  signal: new AbortController().signal,
});

function mockFetcher(handler: () => Response | Promise<Response>): NetCallbacks {
  return {
    fetch: () => Promise.resolve(handler()),
  };
}

describe('hub grants — audit log integration', () => {
  test('net.fetch emits an entry with redacted body + headers', async () => {
    const entries: AuditEntry[] = [];
    const fetcher = mockFetcher(
      () =>
        new Response('the-response-body', {
          status: 200,
          headers: { 'content-type': 'text/plain', 'set-cookie': 'session=secret' },
        })
    );
    const reg = buildHubGrants(fetcher, {
      net: { resolver: PUBLIC_RESOLVER },
      auditLogger: (e) => entries.push(e),
    });
    await reg.dispatch(
      'dev.brika.net.fetch',
      {
        url: 'https://api.example.com/x',
        method: 'POST',
        headers: { Authorization: 'Bearer SECRET', 'X-Trace': '1' },
        body: '{"a":1}',
      },
      handlerCtx({ allow: ['api.example.com'] })
    );
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry?.grantId).toBe('dev.brika.net.fetch');
    expect(entry?.pluginUid).toBe('plug-audit-1');

    // Use `toMatchObject` for shape assertions on `unknown` audit fields
    // — avoids casting and keeps the structural intent obvious.
    expect(entry?.args).toMatchObject({
      url: 'https://api.example.com/x',
      method: 'POST',
      headers: {
        Authorization: '<redacted>',
        'X-Trace': '1',
      },
      bodyBytes: '{"a":1}'.length,
    });
    expect(entry?.result).toMatchObject({
      status: 200,
      headers: {
        'set-cookie': '<redacted>',
        'content-type': 'text/plain',
      },
      bodyBytes: 'the-response-body'.length,
      attempts: 1,
    });
  });

  test('net.fetch denied-host failure records errCode and skips result', async () => {
    const entries: AuditEntry[] = [];
    const reg = buildHubGrants(
      mockFetcher(() => new Response('')),
      {
        net: { resolver: PUBLIC_RESOLVER },
        auditLogger: (e) => entries.push(e),
      }
    );
    await expect(
      reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://attacker.example/', method: 'GET' },
        handlerCtx({ allow: ['api.example.com'] })
      )
    ).rejects.toThrow();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.errCode).toBe('NET_HOST_NOT_ALLOWED');
    expect(entries[0]?.result).toBeUndefined();
  });

  test('dns.lookup emits an entry; result is summarised as addressCount', async () => {
    const entries: AuditEntry[] = [];
    const reg = buildHubGrants(
      mockFetcher(() => new Response('')),
      {
        net: { resolver: PUBLIC_RESOLVER },
        dns: { lookup: async () => [{ address: PUBLIC_IP, family: 4 }] },
        auditLogger: (e) => entries.push(e),
      }
    );
    await reg.dispatch(
      'dev.brika.dns.lookup',
      { hostname: 'api.example.com', family: 0 },
      handlerCtx({ allow: ['api.example.com'] })
    );
    expect(entries[0]?.grantId).toBe('dev.brika.dns.lookup');
    expect(entries[0]?.result).toEqual({ addressCount: 1 });
    // Args weren't redacted by the spec — hostname + family pass through.
    expect(entries[0]?.args).toEqual({ hostname: 'api.example.com', family: 0 });
  });

  test('omitting auditLogger means no entries are produced', async () => {
    const fetcher = mockFetcher(() => new Response('hi'));
    const reg = buildHubGrants(fetcher, { net: { resolver: PUBLIC_RESOLVER } });
    // No auditLogger key — should be a no-op for audit purposes.
    const result = await reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://api.example.com/x', method: 'GET' },
      handlerCtx({ allow: ['api.example.com'] })
    );
    expect(result).toBeDefined();
  });
});
