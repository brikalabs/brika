/**
 * Unit tests for `grants/ws.ts` — schema parses, redact for connect/send,
 * placeholder handler for each verb.
 */

import { describe, expect, test } from 'bun:test';
import {
  WsCloseArgsSchema,
  WsCloseResultSchema,
  WsConnectArgsSchema,
  WsConnectResultSchema,
  WsScopeSchema,
  WsSendArgsSchema,
  WsSendResultSchema,
  wsClose,
  wsConnect,
  wsSend,
} from './ws';

const stubHandlerCtx = {
  pluginUid: 'plugin-x',
  pluginRoot: '/plugins/x',
  grantedScope: { allow: [] },
  log: () => undefined,
  signal: new AbortController().signal,
};

describe('WsScopeSchema', () => {
  test('parses allow-list', () => {
    expect(WsScopeSchema.parse({ allow: ['*.example.com'] })).toEqual({
      allow: ['*.example.com'],
    });
  });
});

describe('ws.connect spec', () => {
  test('parses minimal args', () => {
    expect(WsConnectArgsSchema.parse({ url: 'wss://x.example' })).toEqual({
      url: 'wss://x.example',
    });
  });

  test('parses protocols + headers', () => {
    const parsed = WsConnectArgsSchema.parse({
      url: 'wss://x.example',
      protocols: ['v1', 'v2'],
      headers: { 'X-Origin': 'plugin' },
    });
    expect(parsed.protocols).toEqual(['v1', 'v2']);
    expect(parsed.headers).toEqual({ 'X-Origin': 'plugin' });
  });

  test('rejects non-URL url', () => {
    expect(() => WsConnectArgsSchema.parse({ url: 'nope' })).toThrow();
  });

  test('result schema parses handleId', () => {
    expect(WsConnectResultSchema.parse({ handleId: 'h1' })).toEqual({ handleId: 'h1' });
  });

  test('redact.args with no headers shows headerCount:0', () => {
    const summary = wsConnect.spec.redact?.args?.({
      url: 'wss://x.example',
    });
    expect(summary).toEqual({
      url: 'wss://x.example',
      protocols: undefined,
      headerCount: 0,
    });
  });

  test('redact.args counts headers', () => {
    const summary = wsConnect.spec.redact?.args?.({
      url: 'wss://x.example',
      headers: { a: '1', b: '2' },
      protocols: ['v1'],
    });
    expect(summary).toEqual({
      url: 'wss://x.example',
      protocols: ['v1'],
      headerCount: 2,
    });
  });

  test('SDK-side handler throws', () => {
    expect(() => wsConnect.handler(stubHandlerCtx, { url: 'wss://x.example' })).toThrow(
      /SDK-side handler invoked/
    );
  });
});

describe('ws.send spec', () => {
  test('parses text frame', () => {
    expect(WsSendArgsSchema.parse({ handleId: 'h', data: 'hi' })).toEqual({
      handleId: 'h',
      data: 'hi',
    });
  });

  test('parses binary frame', () => {
    const parsed = WsSendArgsSchema.parse({ handleId: 'h', data: new Uint8Array([1, 2, 3]) });
    expect(parsed.data).toBeInstanceOf(Uint8Array);
  });

  test('result schema parses bytesSent', () => {
    expect(WsSendResultSchema.parse({ bytesSent: 4 })).toEqual({ bytesSent: 4 });
  });

  test('redact.args summarises bytes for text', () => {
    const summary = wsSend.spec.redact?.args?.({ handleId: 'h', data: 'hello' });
    expect(summary).toEqual({ handleId: 'h', bytes: 5 });
  });

  test('redact.args summarises bytes for binary', () => {
    const summary = wsSend.spec.redact?.args?.({
      handleId: 'h',
      data: new Uint8Array([1, 2, 3, 4]),
    });
    expect(summary).toEqual({ handleId: 'h', bytes: 4 });
  });

  test('SDK-side handler throws', () => {
    expect(() => wsSend.handler(stubHandlerCtx, { handleId: 'h', data: 'x' })).toThrow(
      /SDK-side handler invoked/
    );
  });
});

describe('ws.close spec', () => {
  test('parses minimal args', () => {
    expect(WsCloseArgsSchema.parse({ handleId: 'h' })).toEqual({ handleId: 'h' });
  });

  test('parses code + reason', () => {
    expect(WsCloseArgsSchema.parse({ handleId: 'h', code: 1000, reason: 'normal' })).toEqual({
      handleId: 'h',
      code: 1000,
      reason: 'normal',
    });
  });

  test('rejects close code outside 1000-4999', () => {
    expect(() => WsCloseArgsSchema.parse({ handleId: 'h', code: 999 })).toThrow();
    expect(() => WsCloseArgsSchema.parse({ handleId: 'h', code: 5000 })).toThrow();
  });

  test('result schema parses closed flag', () => {
    expect(WsCloseResultSchema.parse({ closed: true })).toEqual({ closed: true });
  });

  test('SDK-side handler throws', () => {
    expect(() => wsClose.handler(stubHandlerCtx, { handleId: 'h' })).toThrow(
      /SDK-side handler invoked/
    );
  });
});
