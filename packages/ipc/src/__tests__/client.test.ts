/**
 * Tests for IPC Client
 */

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { WireMessage } from '../channel';
import { hello, ping, ready, stop } from '../contract';

// Store original process methods
const originalSend = process.send;
const originalOn = process.on;
const originalRemoveAllListeners = process.removeAllListeners;

describe('Client', () => {
  let sentMessages: WireMessage[];
  let messageHandlers: Map<string, (msg: WireMessage) => void>;
  let mockSend: ReturnType<typeof mock>;
  let mockOn: ReturnType<typeof mock>;
  let mockRemoveAllListeners: ReturnType<typeof mock>;

  beforeEach(() => {
    sentMessages = [];
    messageHandlers = new Map();

    // Mock process.send
    mockSend = mock((msg: WireMessage) => {
      sentMessages.push(msg);
      return true;
    });
    (process as unknown as { send: typeof mockSend }).send = mockSend;

    // Mock process.on
    mockOn = mock((event: string, handler: (msg: WireMessage) => void) => {
      if (event === 'message') {
        messageHandlers.set(event, handler);
      }
      return process;
    });
    (process as unknown as { on: typeof mockOn }).on = mockOn;

    // Mock process.removeAllListeners
    mockRemoveAllListeners = mock((event?: string) => {
      if (event) {
        messageHandlers.delete(event);
      } else {
        messageHandlers.clear();
      }
      return process;
    });
    (
      process as unknown as { removeAllListeners: typeof mockRemoveAllListeners }
    ).removeAllListeners = mockRemoveAllListeners;
  });

  afterEach(() => {
    // Restore original process methods
    (process as unknown as { send: typeof originalSend }).send = originalSend;
    (process as unknown as { on: typeof originalOn }).on = originalOn;
    (
      process as unknown as { removeAllListeners: typeof originalRemoveAllListeners }
    ).removeAllListeners = originalRemoveAllListeners;
  });

  test('constructor throws if process.send is not available', () => {
    (process as unknown as { send: undefined }).send = undefined;

    // Import module fresh to test constructor
    const { Client } = require('../client');

    expect(() => new Client()).toThrow('IPC Client requires process.send');
  });

  test('constructor sets up IPC message listener', () => {
    const { Client } = require('../client');
    new Client();

    expect(mockOn).toHaveBeenCalledWith('message', expect.any(Function));
  });

  describe('send', () => {
    test('sends message via process.send', () => {
      const { Client } = require('../client');
      const client = new Client();

      client.send(ready, {});

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]?.t).toBe('ready');
    });
  });

  describe('start', () => {
    test('sends hello and ready messages', () => {
      const { Client } = require('../client');
      const client = new Client();

      client.start({ id: 'test-plugin', version: '1.0.0' });

      expect(sentMessages).toHaveLength(2);
      expect(sentMessages[0]?.t).toBe('hello');
      expect(sentMessages[1]?.t).toBe('ready');
    });
  });

  describe('on', () => {
    test('registers message handler', async () => {
      const { Client } = require('../client');
      const client = new Client();

      const handler = mock(() => undefined);
      client.on(hello, handler);

      // Simulate receiving message
      const messageHandler = messageHandlers.get('message');
      await messageHandler?.({
        t: 'hello',
        plugin: { id: 'test', version: '1.0' },
      } as WireMessage);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('returns unsubscribe function', async () => {
      const { Client } = require('../client');
      const client = new Client();

      const handler = mock(() => undefined);
      const unsubscribe = client.on(hello, handler);

      // Simulate first message
      const messageHandler = messageHandlers.get('message');
      await messageHandler?.({
        t: 'hello',
        plugin: { id: 'test1', version: '1.0' },
      } as WireMessage);

      unsubscribe();

      // Simulate second message
      await messageHandler?.({
        t: 'hello',
        plugin: { id: 'test2', version: '1.0' },
      } as WireMessage);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('implement', () => {
    test('implements RPC handler', async () => {
      const { Client } = require('../client');
      const client = new Client();

      client.implement(ping, ({ ts }: { ts: number }) => ({ ts }));

      // Simulate RPC request
      const messageHandler = messageHandlers.get('message');
      await messageHandler?.({
        t: 'ping',
        _id: 1,
        ts: 123456,
      } as unknown as WireMessage);

      // Check response was sent
      expect(sentMessages.some((m) => m.t === 'pingResult')).toBe(true);
    });
  });

  describe('call', () => {
    test('sends RPC request', async () => {
      const { Client } = require('../client');
      const client = new Client();

      // Start call (will timeout, but we can check it was sent)
      const callPromise = client.call(ping, { ts: Date.now() }, 50);

      expect(sentMessages.some((m) => m.t === 'ping')).toBe(true);

      // Clean up by letting it timeout
      await callPromise.catch(() => undefined);
    });
  });

  describe('onStop', () => {
    test('registers stop handler', () => {
      const { Client } = require('../client');
      const client = new Client();

      const stopHandler = mock(() => undefined);
      client.onStop(stopHandler);

      // Handler should not be called yet
      expect(stopHandler).not.toHaveBeenCalled();
    });

    test('can register multiple stop handlers', () => {
      const { Client } = require('../client');
      const client = new Client();

      const handler1 = mock(() => undefined);
      const handler2 = mock(() => undefined);
      const handler3 = mock(() => undefined);

      client.onStop(handler1);
      client.onStop(handler2);
      client.onStop(handler3);

      // None should be called yet
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).not.toHaveBeenCalled();
    });
  });

  describe('call with response', () => {
    test('resolves when response is received', async () => {
      const { Client } = require('../client');
      const client = new Client();

      // Start call
      const callPromise = client.call(ping, { ts: 123 }, 100);

      // Find the request ID
      const pingMsg = sentMessages.find((m) => m.t === 'ping');
      const requestId = (pingMsg as { _id?: number })?._id;

      // Simulate response
      const messageHandler = messageHandlers.get('message');
      await messageHandler?.({
        t: 'pingResult',
        _id: requestId,
        result: { ts: 456 },
      } as unknown as WireMessage);

      const result = await callPromise;
      expect(result).toMatchObject({ ts: 456 });
    });

    test('rejects on timeout', async () => {
      const { Client } = require('../client');
      const client = new Client();

      const callPromise = client.call(ping, { ts: 123 }, 10);

      await expect(callPromise).rejects.toThrow();
    });
  });

  describe('channel', () => {
    test('exposes underlying channel', () => {
      const { Client } = require('../client');
      const client = new Client();

      expect(client.channel).toBeDefined();
    });
  });
});

describe('createClient', () => {
  beforeEach(() => {
    // Mock process.send for constructor
    (process as unknown as { send: ReturnType<typeof mock> }).send = mock(() => true);
    (process as unknown as { on: ReturnType<typeof mock> }).on = mock(() => process);
    (process as unknown as { removeAllListeners: ReturnType<typeof mock> }).removeAllListeners =
      mock(() => process);
  });

  afterEach(() => {
    // Restore
    (process as unknown as { send: undefined }).send = undefined;
  });

  test('creates Client instance', () => {
    const { createClient, Client } = require('../client');
    const client = createClient();

    expect(client).toBeInstanceOf(Client);
  });

  test('passes options to Client', () => {
    const { createClient } = require('../client');
    const client = createClient({ defaultTimeoutMs: 5000 });

    expect(client).toBeDefined();
  });
});
