/**
 * Tests for IPC Host (PluginChannel)
 */

import { describe, expect, mock, test } from 'bun:test';
import type { WireMessage } from '../channel';
import { hello, ping, ready, stop } from '../contract';
import { PluginChannel } from '../host';

// Create a mock subprocess
const createMockProcess = (
  options: {
    onSend?: (msg: WireMessage) => void;
    exitCode?: number;
    exitDelay?: number;
    pid?: number;
  } = {}
) => {
  const exitPromise =
    options.exitDelay !== undefined
      ? new Promise<number>((resolve) =>
          setTimeout(() => resolve(options.exitCode ?? 0), options.exitDelay)
        )
      : new Promise<number>(() => {
          /* intentionally never resolves */
        });

  const sendFn = mock((msg: WireMessage) => {
    options.onSend?.(msg);
  });

  return {
    pid: options.pid ?? 12345,
    send: sendFn,
    kill: mock(() => undefined),
    stdin: null,
    stdout: null,
    stderr: null, // No stderr to avoid pipe setup
    exited: exitPromise,
  } as unknown as ReturnType<typeof Bun.spawn>;
};

describe('PluginChannel', () => {
  describe('constructor', () => {
    test('creates channel with process', () => {
      const proc = createMockProcess();
      const channel = new PluginChannel(proc);

      expect(channel.isDisconnected).toBe(false);
      expect(channel.pid).toBe(12345);
    });

    test('accepts custom options', () => {
      const proc = createMockProcess();
      const onDisconnect = mock(() => undefined);
      const onStderr = mock(() => undefined);

      const channel = new PluginChannel(proc, {
        defaultTimeoutMs: 5000,
        onDisconnect,
        onStderr,
      });

      expect(channel.isDisconnected).toBe(false);
    });
  });

  describe('properties', () => {
    test('pid returns process pid', () => {
      const proc = createMockProcess({
        pid: 54321,
      });
      const channel = new PluginChannel(proc);

      expect(channel.pid).toBe(54321);
    });

    test('pendingCount returns channel pending count', () => {
      const proc = createMockProcess();
      const channel = new PluginChannel(proc);

      expect(channel.pendingCount).toBe(0);
    });

    test('channel accessor returns underlying channel', () => {
      const proc = createMockProcess();
      const channel = new PluginChannel(proc);

      expect(channel.channel).toBeDefined();
    });

    test('proc accessor returns underlying process', () => {
      const proc = createMockProcess();
      const channel = new PluginChannel(proc);

      expect(channel.proc).toBe(proc);
    });
  });

  describe('send', () => {
    test('sends message through channel', () => {
      const sentMessages: WireMessage[] = [];
      const proc = createMockProcess({
        onSend: (msg) => sentMessages.push(msg),
      });
      const channel = new PluginChannel(proc);

      channel.send(ready, {});

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]?.t).toBe('ready');
    });
  });

  describe('handle', () => {
    test('handles incoming message', async () => {
      const proc = createMockProcess();
      const channel = new PluginChannel(proc);

      const received: unknown[] = [];
      channel.on(hello, (payload) => {
        received.push(payload);
      });

      await channel.channel.handle({
        t: 'hello',
        plugin: {
          id: 'test',
          version: '1.0.0',
        },
      } as WireMessage);

      expect(received).toHaveLength(1);
    });
  });

  describe('on', () => {
    test('registers message handler', async () => {
      const proc = createMockProcess();
      const channel = new PluginChannel(proc);

      const handler = mock(() => undefined);
      channel.on(hello, handler);

      await channel.channel.handle({
        t: 'hello',
        plugin: {
          id: 'test',
          version: '1.0.0',
        },
      } as WireMessage);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('returns unsubscribe function', async () => {
      const proc = createMockProcess();
      const channel = new PluginChannel(proc);

      const handler = mock(() => undefined);
      const unsubscribe = channel.on(hello, handler);

      // First message should trigger handler
      await channel.channel.handle({
        t: 'hello',
        plugin: {
          id: 'test1',
          version: '1.0.0',
        },
      } as WireMessage);

      // Unsubscribe
      unsubscribe();

      // Second message should not trigger handler
      await channel.channel.handle({
        t: 'hello',
        plugin: {
          id: 'test2',
          version: '1.0.0',
        },
      } as WireMessage);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('implement', () => {
    test('implements RPC handler', async () => {
      const sentMessages: WireMessage[] = [];
      const proc = createMockProcess({
        onSend: (msg) => sentMessages.push(msg),
      });
      const channel = new PluginChannel(proc);

      channel.implement(ping, ({ ts }) => ({
        ts,
      }));

      await channel.channel.handle({
        t: 'ping',
        _id: 1,
        ts: 123456,
      } as unknown as WireMessage);

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]?.t).toBe('pingResult');
    });
  });

  describe('stop', () => {
    test('sends stop message', () => {
      const sentMessages: WireMessage[] = [];
      const proc = createMockProcess({
        onSend: (msg) => sentMessages.push(msg),
      });
      const channel = new PluginChannel(proc);

      channel.stop();

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]?.t).toBe('stop');
    });
  });

  describe('kill', () => {
    test('kills the process', () => {
      const proc = createMockProcess();
      const channel = new PluginChannel(proc);

      channel.kill();

      expect(proc.kill).toHaveBeenCalled();
      expect(channel.isDisconnected).toBe(true);
    });

    test('kills with signal', () => {
      const proc = createMockProcess();
      const channel = new PluginChannel(proc);

      channel.kill(9);

      expect(proc.kill).toHaveBeenCalledWith(9);
    });

    test('calls onDisconnect callback', () => {
      const proc = createMockProcess();
      const onDisconnect = mock(() => undefined);
      const channel = new PluginChannel(proc, {
        onDisconnect,
      });

      channel.kill();

      expect(onDisconnect).toHaveBeenCalledTimes(1);
      expect((onDisconnect.mock.calls as unknown[][])[0]?.[0]).toBeInstanceOf(Error);
    });
  });

  describe('disconnect handling', () => {
    test('handles process exit', async () => {
      const onDisconnect = mock(() => undefined);
      const proc = createMockProcess({
        exitCode: 1,
        exitDelay: 10,
      });
      const channel = new PluginChannel(proc, {
        onDisconnect,
      });

      // Wait for process to "exit"
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(channel.isDisconnected).toBe(true);
      expect(onDisconnect).toHaveBeenCalled();
    });

    test('does not send after disconnect', () => {
      const sentMessages: WireMessage[] = [];
      const proc = createMockProcess({
        onSend: (msg) => sentMessages.push(msg),
      });
      const channel = new PluginChannel(proc);

      // Force disconnect
      channel.kill();

      // Try to send
      channel.send(ready, {});

      // Message should not be sent (only stop message from kill)
      expect(sentMessages.some((m) => m.t === 'ready')).toBe(false);
    });

    test('disconnect is idempotent', () => {
      const proc = createMockProcess();
      const onDisconnect = mock(() => undefined);
      const channel = new PluginChannel(proc, {
        onDisconnect,
      });

      channel.kill();
      channel.kill();
      channel.kill();

      expect(onDisconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('ping', () => {
    test('sends ping and waits for response', async () => {
      const sentMessages: WireMessage[] = [];
      const proc = createMockProcess({
        onSend: (msg) => sentMessages.push(msg),
      });
      const channel = new PluginChannel(proc);

      // Start ping (will timeout since no response)
      const pingPromise = channel.ping(50);

      // Verify ping was sent
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]?.t).toBe('ping');

      // Simulate response
      const requestId = (
        sentMessages[0] as {
          _id?: number;
        }
      )?._id;
      channel.handle({
        t: 'pingResult',
        _id: requestId,
        result: {
          ts: Date.now(),
        },
      } as unknown as WireMessage);

      const latency = await pingPromise;
      expect(latency).toBeGreaterThanOrEqual(0);
    });

    test('times out if no response', async () => {
      const proc = createMockProcess();
      const channel = new PluginChannel(proc);

      // Ping with very short timeout
      const pingPromise = channel.ping(10);

      await expect(pingPromise).rejects.toThrow();
    });
  });

  describe('call', () => {
    test('calls RPC on plugin', async () => {
      const sentMessages: WireMessage[] = [];
      const proc = createMockProcess({
        onSend: (msg) => sentMessages.push(msg),
      });
      const channel = new PluginChannel(proc);

      // Start call
      const callPromise = channel.call(
        ping,
        {
          ts: Date.now(),
        },
        50
      );

      // Verify call was sent
      expect(sentMessages.some((m) => m.t === 'ping')).toBeTrue();

      // Simulate response
      const requestMsg = sentMessages.find((m) => m.t === 'ping');
      const requestId = (
        requestMsg as {
          _id?: number;
        }
      )?._id;
      channel.handle({
        t: 'pingResult',
        _id: requestId,
        result: {
          ts: 123456,
        },
      } as unknown as WireMessage);

      const result = await callPromise;
      expect(result).toMatchObject({
        ts: 123456,
      });
    });

    test('times out if no response', async () => {
      const proc = createMockProcess();
      const channel = new PluginChannel(proc);

      const callPromise = channel.call(
        ping,
        {
          ts: Date.now(),
        },
        10
      );

      await expect(callPromise).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    test('handles send errors gracefully', () => {
      const proc = createMockProcess();
      // Make send throw an error
      (proc.send as ReturnType<typeof mock>).mockImplementation(() => {
        throw new Error('Send failed');
      });

      const onDisconnect = mock(() => undefined);
      const channel = new PluginChannel(proc, {
        onDisconnect,
      });

      // Try to send - should not throw
      expect(() => channel.send(ready, {})).not.toThrow();

      // Should have triggered disconnect
      expect(channel.isDisconnected).toBeTrue();
    });

    test('handles kill when process already dead', () => {
      const proc = createMockProcess();
      // Make kill throw an error
      (proc.kill as ReturnType<typeof mock>).mockImplementation(() => {
        throw new Error('Process already dead');
      });

      const channel = new PluginChannel(proc);

      // Should not throw
      expect(() => channel.kill()).not.toThrow();
      expect(channel.isDisconnected).toBeTrue();
    });
  });

  describe('process exit handling', () => {
    test('includes exit code in disconnect error', async () => {
      const onDisconnect = mock(() => undefined);
      const proc = createMockProcess({
        exitCode: 127,
        exitDelay: 10,
      });
      const _channel = new PluginChannel(proc, {
        onDisconnect,
      });

      // Wait for process to "exit"
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(onDisconnect).toHaveBeenCalled();
      const error = (onDisconnect.mock.calls as unknown[][])[0]?.[0] as Error;
      expect(error.message).toContain('127');
    });
  });

  describe('stderr piping', () => {
    test('reads stderr lines and calls onStderr callback', async () => {
      const stderrLines: string[] = [];
      const onStderr = mock((line: string) => {
        stderrLines.push(line);
      });

      // Create a ReadableStream that emits stderr data
      const encoder = new TextEncoder();
      const stderrStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('error line 1\nerror line 2\n'));
          controller.close();
        },
      });

      const proc = {
        pid: 99999,
        send: mock(() => undefined),
        kill: mock(() => undefined),
        stdin: null,
        stdout: null,
        stderr: stderrStream,
        exited: new Promise<number>(() => {}),
      } as unknown as ReturnType<typeof Bun.spawn>;

      const _channel = new PluginChannel(proc, {
        onStderr,
      });

      // Wait for async stderr reading to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(stderrLines).toContain('error line 1');
      expect(stderrLines).toContain('error line 2');
    });

    test('stderr buffer is included in exit error message', async () => {
      const onDisconnect = mock(() => undefined);

      const encoder = new TextEncoder();
      const stderrStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('fatal: something broke\n'));
          controller.close();
        },
      });

      const proc = {
        pid: 99998,
        send: mock(() => undefined),
        kill: mock(() => undefined),
        stdin: null,
        stdout: null,
        stderr: stderrStream,
        exited: new Promise<number>((resolve) => setTimeout(() => resolve(1), 60)),
      } as unknown as ReturnType<typeof Bun.spawn>;

      const _channel = new PluginChannel(proc, {
        onDisconnect,
      });

      // Wait for stderr reading and process exit
      await new Promise((resolve) => setTimeout(resolve, 120));

      expect(onDisconnect).toHaveBeenCalled();
      const error = (onDisconnect.mock.calls as unknown[][])[0]?.[0] as Error;
      expect(error.message).toContain('fatal: something broke');
    });

    test('stderr handles remaining buffer when stream ends', async () => {
      const stderrLines: string[] = [];
      const onStderr = mock((line: string) => {
        stderrLines.push(line);
      });

      // Send data WITHOUT a trailing newline to exercise the remaining buffer path
      const encoder = new TextEncoder();
      const stderrStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('no newline at end'));
          controller.close();
        },
      });

      const proc = {
        pid: 99997,
        send: mock(() => undefined),
        kill: mock(() => undefined),
        stdin: null,
        stdout: null,
        stderr: stderrStream,
        exited: new Promise<number>(() => {}),
      } as unknown as ReturnType<typeof Bun.spawn>;

      const _channel = new PluginChannel(proc, {
        onStderr,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(stderrLines).toContain('no newline at end');
    });

    test('stderr buffer trims to MAX_STDERR_LINES', async () => {
      const _onStderr = mock(() => undefined);

      // Send more than 20 lines
      const encoder = new TextEncoder();
      const lines = `${Array.from(
        {
          length: 30,
        },
        (_, i) => `line ${i + 1}`
      ).join('\n')}\n`;
      const stderrStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(lines));
          controller.close();
        },
      });

      const onDisconnect = mock(() => undefined);
      const proc = {
        pid: 99996,
        send: mock(() => undefined),
        kill: mock(() => undefined),
        stdin: null,
        stdout: null,
        stderr: stderrStream,
        exited: new Promise<number>((resolve) => setTimeout(() => resolve(1), 60)),
      } as unknown as ReturnType<typeof Bun.spawn>;

      const _channel = new PluginChannel(proc, {
        onDisconnect,
      });

      // Wait for stderr and process exit
      await new Promise((resolve) => setTimeout(resolve, 120));

      expect(onDisconnect).toHaveBeenCalled();
      const error = (onDisconnect.mock.calls as unknown[][])[0]?.[0] as Error;
      // Should contain the last line (line 30) but not the first line (line 1)
      expect(error.message).toContain('line 30');
      expect(error.message).not.toContain('line 1\n');
    });

    test('stderr skips empty lines', async () => {
      const stderrLines: string[] = [];
      const onStderr = mock((line: string) => {
        stderrLines.push(line);
      });

      const encoder = new TextEncoder();
      const stderrStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('real line\n\n  \n\nanother real line\n'));
          controller.close();
        },
      });

      const proc = {
        pid: 99995,
        send: mock(() => undefined),
        kill: mock(() => undefined),
        stdin: null,
        stdout: null,
        stderr: stderrStream,
        exited: new Promise<number>(() => {}),
      } as unknown as ReturnType<typeof Bun.spawn>;

      const _channel = new PluginChannel(proc, {
        onStderr,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(stderrLines).toEqual(['real line', 'another real line']);
    });
  });
});
