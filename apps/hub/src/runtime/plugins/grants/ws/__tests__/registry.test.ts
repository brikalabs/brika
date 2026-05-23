/**
 * Unit tests for `WsHandleRegistry`. Pure data-structure tests; no
 * real WebSocket involved.
 */

import { describe, expect, test } from 'bun:test';
import { WsHandleRegistry } from '../registry';
import type { WsConnection } from '../types';

function fakeConn(): WsConnection {
  return {
    readyState: 1,
    send: () => undefined,
    close: () => undefined,
    set onopen(_h: () => void) {},
    set onmessage(_h: (data: string | Uint8Array) => void) {},
    set onclose(_h: (code: number, reason: string) => void) {},
    set onerror(_h: (message: string) => void) {},
  };
}

describe('WsHandleRegistry', () => {
  test('register returns a unique handle id each time', () => {
    const reg = new WsHandleRegistry(8);
    const a = reg.register(fakeConn());
    const b = reg.register(fakeConn());
    expect(a).not.toBe(b);
    expect(reg.size()).toBe(2);
  });

  test('get returns the registered connection', () => {
    const reg = new WsHandleRegistry(8);
    const c = fakeConn();
    const id = reg.register(c);
    expect(reg.get(id)).toBe(c);
  });

  test('get returns null for an unknown id', () => {
    const reg = new WsHandleRegistry(8);
    expect(reg.get('nope')).toBeNull();
  });

  test('take removes and returns', () => {
    const reg = new WsHandleRegistry(8);
    const c = fakeConn();
    const id = reg.register(c);
    expect(reg.take(id)).toBe(c);
    expect(reg.get(id)).toBeNull();
    expect(reg.size()).toBe(0);
  });

  test('atCapacity flips when limit reached', () => {
    const reg = new WsHandleRegistry(2);
    expect(reg.atCapacity()).toBe(false);
    reg.register(fakeConn());
    expect(reg.atCapacity()).toBe(false);
    reg.register(fakeConn());
    expect(reg.atCapacity()).toBe(true);
  });

  test('closeAll closes every connection and empties the registry', () => {
    const reg = new WsHandleRegistry(8);
    let closeCount = 0;
    const make = (): WsConnection => ({
      readyState: 1,
      send: () => undefined,
      close: () => {
        closeCount += 1;
      },
      set onopen(_h: () => void) {},
      set onmessage(_h: (data: string | Uint8Array) => void) {},
      set onclose(_h: (code: number, reason: string) => void) {},
      set onerror(_h: (message: string) => void) {},
    });
    reg.register(make());
    reg.register(make());
    reg.closeAll();
    expect(closeCount).toBe(2);
    expect(reg.size()).toBe(0);
  });

  test('closeAll swallows close-throwing connections', () => {
    const reg = new WsHandleRegistry(8);
    const make = (): WsConnection => ({
      readyState: 1,
      send: () => undefined,
      close: () => {
        throw new Error('close boom');
      },
      set onopen(_h: () => void) {},
      set onmessage(_h: (data: string | Uint8Array) => void) {},
      set onclose(_h: (code: number, reason: string) => void) {},
      set onerror(_h: (message: string) => void) {},
    });
    reg.register(make());
    expect(() => reg.closeAll()).not.toThrow();
    expect(reg.size()).toBe(0);
  });
});
