/**
 * Unit tests for `installFsRuntime`. Uses the same loopback Channel
 * pair as the fetch and DNS proxy tests so we can exercise the full
 * dispatch round-trip without spawning a real plugin process.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { Channel, type WireMessage } from '@brika/ipc';
import { grantRequest } from '@brika/ipc/contract';
import { installFsRuntime } from './fs-runtime';

interface GrantCall {
  id: string;
  args: unknown;
}

function loopback(handler: (call: GrantCall) => unknown): {
  pluginChan: Channel;
  hubChan: Channel;
  calls: GrantCall[];
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
  const calls: GrantCall[] = [];
  hubChan.implement(grantRequest, async (req) => {
    const recorded: GrantCall = { id: req.id, args: req.args };
    calls.push(recorded);
    return { result: handler(recorded) };
  });
  return { pluginChan, hubChan, calls };
}

afterEach(() => {
  // Tests install on globalThis; tidy up so the next test sees a clean
  // slate.
  globalThis.__brika_fs = undefined;
});

describe('installFsRuntime', () => {
  test('readFile forwards args and unwraps the result', async () => {
    const { pluginChan, calls } = loopback(() => ({
      encoding: 'utf-8',
      content: 'hello',
    }));
    installFsRuntime({ channel: pluginChan });
    const r = globalThis.__brika_fs;
    if (!r) {
      throw new Error('runtime not installed');
    }
    const out = await r.readFile({ path: '/data/foo.txt', encoding: 'utf-8' });
    expect(out).toEqual({ encoding: 'utf-8', content: 'hello' });
    expect(calls[0]?.id).toBe('dev.brika.fs.readFile');
    expect(calls[0]?.args).toEqual({ path: '/data/foo.txt', encoding: 'utf-8' });
  });

  test('writeFile returns bytesWritten', async () => {
    const { pluginChan, calls } = loopback(() => ({ bytesWritten: 5 }));
    installFsRuntime({ channel: pluginChan });
    const r = globalThis.__brika_fs;
    if (!r) {
      throw new Error('runtime not installed');
    }
    const out = await r.writeFile({ path: '/data/x', content: 'hello', mode: 'overwrite' });
    expect(out).toEqual({ bytesWritten: 5 });
    expect(calls[0]?.id).toBe('dev.brika.fs.writeFile');
  });

  test('readdir returns the entries array', async () => {
    const { pluginChan } = loopback(() => ({
      entries: [{ name: 'a', isFile: true, isDirectory: false, isSymlink: false }],
    }));
    installFsRuntime({ channel: pluginChan });
    const r = globalThis.__brika_fs;
    if (!r) {
      throw new Error('runtime not installed');
    }
    const out = await r.readdir({ path: '/data', recursive: false });
    expect(out.entries).toHaveLength(1);
  });

  test('stat returns the metadata object', async () => {
    const { pluginChan } = loopback(() => ({
      size: 12,
      mtimeMs: 1_000_000,
      isFile: true,
      isDirectory: false,
      isSymlink: false,
    }));
    installFsRuntime({ channel: pluginChan });
    const r = globalThis.__brika_fs;
    if (!r) {
      throw new Error('runtime not installed');
    }
    const out = await r.stat({ path: '/data/x' });
    expect(out.size).toBe(12);
    expect(out.isFile).toBe(true);
  });

  test('malformed hub result rejects via schema parse', async () => {
    const { pluginChan } = loopback(() => ({ size: 'not-a-number' }));
    installFsRuntime({ channel: pluginChan });
    const r = globalThis.__brika_fs;
    if (!r) {
      throw new Error('runtime not installed');
    }
    await expect(r.stat({ path: '/data/x' })).rejects.toThrow();
  });

  test('a second installation replaces the first (idempotent)', () => {
    const { pluginChan } = loopback(() => ({ exists: true }));
    installFsRuntime({ channel: pluginChan });
    const first = globalThis.__brika_fs;
    const other = loopback(() => ({ exists: false }));
    installFsRuntime({ channel: other.pluginChan });
    expect(globalThis.__brika_fs).not.toBe(first);
  });
});
