/**
 * Unit tests for `Bun.dns.*` proxies.
 *
 * Same loopback pattern as the fetch-proxy tests: build two `Channel`
 * instances connected to each other, register a `grantRequest` handler
 * on the hub side that produces canned responses for each grant id,
 * then exercise the proxy.
 */

import { describe, expect, test } from 'bun:test';
import { Channel, type WireMessage } from '@brika/ipc';
import { grantRequest } from '@brika/ipc/contract';
import { buildDnsProxies } from './dns-proxy';

interface RecordedCall {
  id: string;
  args: unknown;
}

function loopback(handler: (call: RecordedCall) => unknown): {
  pluginChan: Channel;
  hubChan: Channel;
  calls: RecordedCall[];
} {
  let pluginChan!: Channel;
  let hubChan!: Channel;
  pluginChan = new Channel({
    send: (m: WireMessage) => {
      queueMicrotask(() => hubChan.handle(m).catch(() => undefined));
    },
  });
  hubChan = new Channel({
    send: (m: WireMessage) => {
      queueMicrotask(() => pluginChan.handle(m).catch(() => undefined));
    },
  });
  const calls: RecordedCall[] = [];
  hubChan.implement(grantRequest, async (req) => {
    const recorded: RecordedCall = { id: req.id, args: req.args };
    calls.push(recorded);
    return { result: handler(recorded) };
  });
  return { pluginChan, hubChan, calls };
}

const PUBLIC_V4 = [8, 8, 8, 8].join('.');

describe('Bun.dns proxies', () => {
  test('lookup forwards hostname + family and returns the unwrapped addresses array', async () => {
    const { pluginChan, calls } = loopback(() => ({
      addresses: [{ address: PUBLIC_V4, family: 4 }],
    }));
    const { lookup } = buildDnsProxies({ channel: pluginChan });
    const out = await lookup('api.example.com', { family: 4 });
    expect(out).toEqual([{ address: PUBLIC_V4, family: 4 }]);
    expect(calls[0]?.id).toBe('dev.brika.dns.lookup');
    expect(calls[0]?.args).toEqual({ hostname: 'api.example.com', family: 4 });
  });

  test('lookup defaults family to 0 (both v4 and v6)', async () => {
    const { pluginChan, calls } = loopback(() => ({ addresses: [] }));
    const { lookup } = buildDnsProxies({ channel: pluginChan });
    await lookup('api.example.com');
    expect(calls[0]?.args).toEqual({ hostname: 'api.example.com', family: 0 });
  });

  test('resolveTxt returns the records array directly', async () => {
    const { pluginChan, calls } = loopback(() => ({
      records: [['v=spf1', '~all'], ['google-verification=xyz']],
    }));
    const { resolveTxt } = buildDnsProxies({ channel: pluginChan });
    const out = await resolveTxt('example.com');
    expect(out).toEqual([['v=spf1', '~all'], ['google-verification=xyz']]);
    expect(calls[0]?.id).toBe('dev.brika.dns.resolveTxt');
    expect(calls[0]?.args).toEqual({ hostname: 'example.com' });
  });

  test('resolveMx returns priority + exchange pairs', async () => {
    const { pluginChan, calls } = loopback(() => ({
      records: [
        { priority: 10, exchange: 'mx1.example.com' },
        { priority: 20, exchange: 'mx2.example.com' },
      ],
    }));
    const { resolveMx } = buildDnsProxies({ channel: pluginChan });
    const out = await resolveMx('example.com');
    expect(out).toEqual([
      { priority: 10, exchange: 'mx1.example.com' },
      { priority: 20, exchange: 'mx2.example.com' },
    ]);
    expect(calls[0]?.id).toBe('dev.brika.dns.resolveMx');
  });

  test('hub returns malformed result → proxy throws (schema parse)', async () => {
    const { pluginChan } = loopback(() => ({ records: 'not-an-array' }));
    const { resolveTxt } = buildDnsProxies({ channel: pluginChan });
    await expect(resolveTxt('example.com')).rejects.toThrow();
  });
});
