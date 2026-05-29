/**
 * Integration tests for the ws.* hub-side handlers driven through
 * the registry's `dispatch`. The WebSocket factory is stubbed so we
 * can pump synthetic open/message/close/error events at the handler
 * and assert that the stream sink receives the right shapes.
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import { GrantRegistry } from '@brika/grants';
import type { StreamEventType } from '@brika/ipc/contract';
import type { DnsResolver } from '../net/dns-guard';
import { buildWsCloseGrant, buildWsConnectGrant, buildWsSendGrant } from './handlers';
import { WsHandleRegistry } from './registry';
import type { WsConnection, WsFactory } from './types';

const PUBLIC_IP = [8, 8, 8, 8].join('.');
const PUBLIC_RESOLVER: DnsResolver = async () => [PUBLIC_IP];

function setup(opts?: { maxFrameBytes?: number; maxOpen?: number }) {
  const sent: Array<string | Uint8Array> = [];
  const closeCalls: Array<{ code?: number; reason?: string }> = [];
  let onopen: () => void = () => {};
  let onmessage: (data: string | Uint8Array) => void = () => {};
  let onclose: (code: number, reason: string) => void = () => {};
  let onerror: (message: string) => void = () => {};

  const conn: WsConnection = {
    readyState: 1,
    send: (data: string | Uint8Array) => sent.push(data),
    close: (code?: number, reason?: string) => closeCalls.push({ code, reason }),
    set onopen(h: () => void) {
      onopen = h;
    },
    set onmessage(h: (data: string | Uint8Array) => void) {
      onmessage = h;
    },
    set onclose(h: (code: number, reason: string) => void) {
      onclose = h;
    },
    set onerror(h: (message: string) => void) {
      onerror = h;
    },
  };

  const factory: WsFactory = { open: () => conn };
  const registry = new WsHandleRegistry(opts?.maxOpen ?? 8);
  const events: StreamEventType[] = [];
  const sink = (e: StreamEventType): void => {
    events.push(e);
  };

  const reg = new GrantRegistry();
  const deps = {
    factory,
    resolver: PUBLIC_RESOLVER,
    registry,
    sink,
    maxFrameBytes: opts?.maxFrameBytes,
  };
  reg.register(buildWsConnectGrant(deps));
  reg.register(buildWsSendGrant(deps));
  reg.register(buildWsCloseGrant(deps));

  return {
    reg,
    fire: {
      open: () => onopen(),
      message: (data: string | Uint8Array) => onmessage(data),
      close: (code: number, reason: string) => onclose(code, reason),
      error: (message: string) => onerror(message),
    },
    sent,
    closeCalls,
    events,
    registry,
  };
}

const handlerCtx = (scope: unknown) => ({
  pluginUid: 'ws-test',
  pluginRoot: '/nonexistent/plug',
  grantedScope: scope,
  log: () => {},
  signal: new AbortController().signal,
});

describe('ws.connect', () => {
  test('returns a handleId for an allowed host', async () => {
    const t = setup();
    const out = await t.reg.dispatch(
      'dev.brika.ws.connect',
      { url: 'wss://api.example.com/ws' },
      handlerCtx({ allow: ['api.example.com'] })
    );
    expect(out).toMatchObject({ handleId: expect.stringMatching(/^ws_/) });
  });

  test('rejects ws:// to a denied host', async () => {
    const t = setup();
    let thrown: BrikaError | undefined;
    try {
      await t.reg.dispatch(
        'dev.brika.ws.connect',
        { url: 'wss://attacker.example/ws' },
        handlerCtx({ allow: ['api.example.com'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_HOST_NOT_ALLOWED');
  });

  test('rejects http:// (wrong scheme for ws)', async () => {
    const t = setup();
    let thrown: BrikaError | undefined;
    try {
      await t.reg.dispatch(
        'dev.brika.ws.connect',
        { url: 'https://api.example.com/' },
        handlerCtx({ allow: ['api.example.com'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_PROTOCOL_BLOCKED');
  });

  test('blocks DNS rebinding to a private IP', async () => {
    const sent: Array<string | Uint8Array> = [];
    const conn: WsConnection = {
      readyState: 1,
      send: (d: string | Uint8Array) => sent.push(d),
      close: () => undefined,
      set onopen(_h: () => void) {},
      set onmessage(_h: (data: string | Uint8Array) => void) {},
      set onclose(_h: (code: number, reason: string) => void) {},
      set onerror(_h: (message: string) => void) {},
    };
    const reg = new GrantRegistry();
    reg.register(
      buildWsConnectGrant({
        factory: { open: () => conn },
        resolver: async () => ['127.0.0.1'],
        registry: new WsHandleRegistry(8),
        sink: () => undefined,
      })
    );
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.ws.connect',
        { url: 'wss://internal.example/' },
        handlerCtx({ allow: ['internal.example'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_PRIVATE_IP_BLOCKED');
  });

  test('refuses to open past the per-plugin cap', async () => {
    const t = setup({ maxOpen: 1 });
    await t.reg.dispatch(
      'dev.brika.ws.connect',
      { url: 'wss://api.example.com/' },
      handlerCtx({ allow: ['api.example.com'] })
    );
    let thrown: BrikaError | undefined;
    try {
      await t.reg.dispatch(
        'dev.brika.ws.connect',
        { url: 'wss://api.example.com/' },
        handlerCtx({ allow: ['api.example.com'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('WS_OPEN_LIMIT_EXCEEDED');
  });
});

describe('ws stream lifecycle', () => {
  test('open + message + close fan out as streamEvents', async () => {
    const t = setup();
    const { handleId } = (await t.reg.dispatch(
      'dev.brika.ws.connect',
      { url: 'wss://api.example.com/' },
      handlerCtx({ allow: ['api.example.com'] })
    )) as { handleId: string };
    t.fire.open();
    t.fire.message('hello');
    t.fire.close(1000, 'normal');
    expect(t.events).toEqual([
      { kind: 'open', handleId },
      { kind: 'message', handleId, data: 'hello' },
      { kind: 'close', handleId, code: 1000, reason: 'normal' },
    ]);
  });

  test('upstream error becomes an error event', async () => {
    const t = setup();
    await t.reg.dispatch(
      'dev.brika.ws.connect',
      { url: 'wss://api.example.com/' },
      handlerCtx({ allow: ['api.example.com'] })
    );
    t.fire.error('upstream went away');
    expect(t.events.at(-1)).toMatchObject({ kind: 'error', message: 'upstream went away' });
  });

  test('inbound frame larger than cap triggers a server-initiated close', async () => {
    const t = setup({ maxFrameBytes: 5 });
    await t.reg.dispatch(
      'dev.brika.ws.connect',
      { url: 'wss://api.example.com/' },
      handlerCtx({ allow: ['api.example.com'] })
    );
    t.fire.message('this is way too long');
    expect(t.events.at(-1)?.kind).toBe('error');
    expect(t.closeCalls.at(-1)?.code).toBe(1009);
  });
});

describe('ws.send + ws.close', () => {
  test('send forwards the frame to the connection', async () => {
    const t = setup();
    const { handleId } = (await t.reg.dispatch(
      'dev.brika.ws.connect',
      { url: 'wss://api.example.com/' },
      handlerCtx({ allow: ['api.example.com'] })
    )) as { handleId: string };
    const out = await t.reg.dispatch(
      'dev.brika.ws.send',
      { handleId, data: 'ping' },
      handlerCtx({ allow: ['api.example.com'] })
    );
    expect(out).toMatchObject({ bytesSent: 4 });
    expect(t.sent[0]).toBe('ping');
  });

  test('send rejects frames over the cap', async () => {
    const t = setup({ maxFrameBytes: 3 });
    const { handleId } = (await t.reg.dispatch(
      'dev.brika.ws.connect',
      { url: 'wss://api.example.com/' },
      handlerCtx({ allow: ['api.example.com'] })
    )) as { handleId: string };
    let thrown: BrikaError | undefined;
    try {
      await t.reg.dispatch(
        'dev.brika.ws.send',
        { handleId, data: 'too-long' },
        handlerCtx({ allow: ['api.example.com'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('WS_FRAME_TOO_LARGE');
  });

  test('send to an unknown handle throws WS_HANDLE_NOT_FOUND', async () => {
    const t = setup();
    let thrown: BrikaError | undefined;
    try {
      await t.reg.dispatch(
        'dev.brika.ws.send',
        { handleId: 'ws_999', data: 'x' },
        handlerCtx({ allow: ['api.example.com'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('WS_HANDLE_NOT_FOUND');
  });

  test('close removes the handle and forwards code/reason to the conn', async () => {
    const t = setup();
    const { handleId } = (await t.reg.dispatch(
      'dev.brika.ws.connect',
      { url: 'wss://api.example.com/' },
      handlerCtx({ allow: ['api.example.com'] })
    )) as { handleId: string };
    const out = await t.reg.dispatch(
      'dev.brika.ws.close',
      { handleId, code: 1000, reason: 'bye' },
      handlerCtx({ allow: ['api.example.com'] })
    );
    expect(out).toMatchObject({ closed: true });
    expect(t.closeCalls[0]).toEqual({ code: 1000, reason: 'bye' });
    expect(t.registry.get(handleId)).toBeNull();
  });

  test('closing an unknown handle returns closed:false (idempotent)', async () => {
    const t = setup();
    const out = await t.reg.dispatch(
      'dev.brika.ws.close',
      { handleId: 'ws_999' },
      handlerCtx({ allow: [] })
    );
    expect(out).toMatchObject({ closed: false });
  });
});
