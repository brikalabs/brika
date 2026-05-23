/**
 * Unit tests for the plugin-side `globalThis.WebSocket` proxy.
 *
 * Uses the loopback Channel pair from the other proxy tests. The hub
 * side responds to `ws.connect` / `ws.send` / `ws.close` and pushes
 * `streamEvent` messages back at the plugin to exercise the proxy's
 * event dispatcher.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { Channel, type WireMessage } from '@brika/ipc';
import { grantRequest, type StreamEventType, streamEvent } from '@brika/ipc/contract';
import { buildWebSocketProxy } from '../websocket-proxy';

type ConnectArgs = { url: string; protocols?: string[] };
type SendArgs = { handleId: string; data: string | Uint8Array };
type CloseArgs = { handleId: string; code?: number; reason?: string };

interface HubHandlers {
  connect?: (args: ConnectArgs) => { handleId: string };
  send?: (args: SendArgs) => { bytesSent: number };
  close?: (args: CloseArgs) => { closed: boolean };
}

function loopback(handlers: HubHandlers): {
  pluginChan: Channel;
  hubChan: Channel;
  push: (event: StreamEventType) => void;
} {
  let pluginChan!: Channel;
  let hubChan!: Channel;
  pluginChan = new Channel({
    send: (m: WireMessage) => queueMicrotask(() => hubChan.handle(m).catch(() => undefined)),
  });
  hubChan = new Channel({
    send: (m: WireMessage) => queueMicrotask(() => pluginChan.handle(m).catch(() => undefined)),
  });
  hubChan.implement(grantRequest, async (req) => {
    if (req.id === 'dev.brika.ws.connect') {
      const r = handlers.connect?.(req.args as ConnectArgs) ?? { handleId: 'ws_default' };
      return { result: r };
    }
    if (req.id === 'dev.brika.ws.send') {
      const args = req.args as SendArgs;
      const r = handlers.send?.(args) ?? {
        bytesSent: typeof args.data === 'string' ? args.data.length : args.data.byteLength,
      };
      return { result: r };
    }
    if (req.id === 'dev.brika.ws.close') {
      const r = handlers.close?.(req.args as CloseArgs) ?? { closed: true };
      return { result: r };
    }
    throw new Error(`unexpected grant: ${req.id}`);
  });
  return {
    pluginChan,
    hubChan,
    push: (event: StreamEventType) => hubChan.send(streamEvent, event),
  };
}

afterEach(() => {
  // No-op — proxies don't install globals in these tests.
});

interface ProxyShape {
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  addEventListener(type: string, handler: (event: unknown) => void): void;
  removeEventListener(type: string, handler: (event: unknown) => void): void;
}

/**
 * Construct a WebSocket proxy with the typed shape we need for the
 * test assertions. `buildWebSocketProxy().Constructor` returns
 * `unknown` because the proxy doesn't replicate every browser
 * static; we narrow here via a runtime check + structural cast-free
 * widening (Object.assign returns the merged type).
 */
function makeProxy(
  Constructor: new (url: string | URL, protocols?: string | string[]) => unknown,
  url: string
): ProxyShape {
  const raw = new Constructor(url);
  if (!isProxyShape(raw)) {
    throw new Error('proxy did not match the expected shape');
  }
  return raw;
}

function isProxyShape(value: unknown): value is ProxyShape {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    typeof Reflect.get(value, 'send') === 'function' &&
    typeof Reflect.get(value, 'close') === 'function' &&
    typeof Reflect.get(value, 'readyState') === 'number' &&
    typeof Reflect.get(value, 'addEventListener') === 'function' &&
    typeof Reflect.get(value, 'removeEventListener') === 'function'
  );
}

describe('WebSocket proxy — construction + event lifecycle', () => {
  test('open event fires after the hub pushes a stream-open', async () => {
    const t = loopback({ connect: () => ({ handleId: 'ws_42' }) });
    const { Constructor } = buildWebSocketProxy({ channel: t.pluginChan });
    const ws = makeProxy(Constructor, 'wss://api.example.com/');
    let opened = false;
    Object.assign(ws, {
      onopen: () => {
        opened = true;
      },
    });
    // Wait one tick for the constructor's microtask to fire the connect.
    await new Promise((r) => setTimeout(r, 5));
    t.push({ kind: 'open', handleId: 'ws_42' });
    await new Promise((r) => setTimeout(r, 5));
    expect(opened).toBe(true);
  });

  test('message events deliver the data field', async () => {
    const t = loopback({ connect: () => ({ handleId: 'ws_msg' }) });
    const { Constructor } = buildWebSocketProxy({ channel: t.pluginChan });
    const received: unknown[] = [];
    const ws = makeProxy(Constructor, 'wss://api.example.com/');
    Object.assign(ws, {
      onmessage: (e: { data: unknown }) => {
        received.push(e.data);
      },
    });
    await new Promise((r) => setTimeout(r, 5));
    t.push({ kind: 'message', handleId: 'ws_msg', data: 'hello' });
    await new Promise((r) => setTimeout(r, 5));
    expect(received).toEqual(['hello']);
  });

  test('close event sets readyState to CLOSED', async () => {
    const t = loopback({ connect: () => ({ handleId: 'ws_close' }) });
    const { Constructor } = buildWebSocketProxy({ channel: t.pluginChan });
    const ws = makeProxy(Constructor, 'wss://api.example.com/');
    let closed: { code: number; reason: string } | undefined;
    Object.assign(ws, {
      onclose: (e: { code: number; reason: string }) => {
        closed = { code: e.code, reason: e.reason };
      },
    });
    await new Promise((r) => setTimeout(r, 5));
    t.push({ kind: 'close', handleId: 'ws_close', code: 1000, reason: 'bye' });
    await new Promise((r) => setTimeout(r, 5));
    expect(closed).toEqual({ code: 1000, reason: 'bye' });
    expect((ws as { readyState: number }).readyState).toBe(3);
  });

  test('send buffers frames issued before connect resolves', async () => {
    const sentFrames: unknown[] = [];
    const t = loopback({
      connect: () => ({ handleId: 'ws_buf' }),
      send: (args) => {
        sentFrames.push(args.data);
        return { bytesSent: 0 };
      },
    });
    const { Constructor } = buildWebSocketProxy({ channel: t.pluginChan });
    const ws = makeProxy(Constructor, 'wss://api.example.com/');
    // Send IMMEDIATELY — before connect resolves.
    (ws as { send: (d: string) => void }).send('queued');
    await new Promise((r) => setTimeout(r, 15));
    expect(sentFrames).toEqual(['queued']);
  });

  test('close before connect resolves emits a synthetic close event', async () => {
    const t = loopback({ connect: () => ({ handleId: 'ws_early' }) });
    const { Constructor } = buildWebSocketProxy({ channel: t.pluginChan });
    const ws = makeProxy(Constructor, 'wss://api.example.com/');
    let synthClose: { code: number; reason: string } | undefined;
    Object.assign(ws, {
      onclose: (e: { code: number; reason: string }) => {
        synthClose = { code: e.code, reason: e.reason };
      },
    });
    // Close is called SYNCHRONOUSLY after construction — before the
    // microtask that fires the connect grant has run. The proxy
    // detects no handle and emits the synthetic close inline.
    ws.close(1000, 'early');
    expect(synthClose).toEqual({ code: 1000, reason: 'early' });
    // Drain the connect call so the test doesn't leave a pending IPC.
    await new Promise((r) => setTimeout(r, 10));
  });

  test('addEventListener / removeEventListener', async () => {
    const t = loopback({ connect: () => ({ handleId: 'ws_evt' }) });
    const { Constructor } = buildWebSocketProxy({ channel: t.pluginChan });
    const ws = makeProxy(Constructor, 'wss://api.example.com/');
    let count = 0;
    const handler = () => {
      count += 1;
    };
    ws.addEventListener('message', handler);
    await new Promise((r) => setTimeout(r, 5));
    t.push({ kind: 'message', handleId: 'ws_evt', data: 'one' });
    await new Promise((r) => setTimeout(r, 5));
    expect(count).toBe(1);
    ws.removeEventListener('message', handler);
    t.push({ kind: 'message', handleId: 'ws_evt', data: 'two' });
    await new Promise((r) => setTimeout(r, 5));
    expect(count).toBe(1);
  });
});
