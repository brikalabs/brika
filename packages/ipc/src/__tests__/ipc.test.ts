import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { Channel, type WireMessage } from '../channel';
import { callTool, hello, PluginInfo, ping, ready, ToolResult } from '../contract';
import { isMessage, isRpc, message, rpc } from '../define';
import { RpcError, isRpcErrorWire } from '../errors';

describe('Define helpers', () => {
  it('should create a message definition', () => {
    const myMsg = message('test', z.object({ foo: z.string() }));

    expect(myMsg._tag).toBe('message');
    expect(myMsg.name).toBe('test');
    expect(isMessage(myMsg)).toBe(true);
    expect(isRpc(myMsg)).toBe(false);
  });

  it('should create an RPC definition', () => {
    const myRpc = rpc('doThing', z.object({ input: z.string() }), z.object({ output: z.number() }));

    expect(myRpc._tag).toBe('rpc');
    expect(myRpc.name).toBe('doThing');
    expect(isRpc(myRpc)).toBe(true);
    expect(isMessage(myRpc)).toBe(false);
  });
});

describe('Contract definitions', () => {
  it('should have correctly typed hello message', () => {
    expect(hello.name).toBe('hello');
    expect(hello._tag).toBe('message');

    // Validate schema works
    const result = hello.schema.safeParse({
      plugin: { id: 'test', version: '1.0' },
    });
    expect(result.success).toBe(true);
  });

  it('should have correctly typed callTool RPC', () => {
    expect(callTool.name).toBe('callTool');
    expect(callTool._tag).toBe('rpc');

    // Validate input schema
    const inputResult = callTool.input.safeParse({
      tool: 'timer:set',
      args: { duration: 5000 },
      ctx: { traceId: 'abc', source: 'api' },
    });
    expect(inputResult.success).toBe(true);

    // Validate output schema
    const outputResult = callTool.output.safeParse({
      ok: true,
      content: 'Done',
    });
    expect(outputResult.success).toBe(true);
  });
});

describe('Channel', () => {
  let sent: WireMessage[];
  let channel: Channel;

  beforeEach(() => {
    sent = [];
    channel = new Channel({
      send: (msg) => sent.push(msg),
      defaultTimeoutMs: 100,
    });
  });

  describe('send', () => {
    it('should send messages with correct wire format', () => {
      channel.send(hello, {
        plugin: { id: '@brika/test', version: '1.0.0' },
      });

      expect(sent).toHaveLength(1);
      expect(sent[0]).toEqual({
        t: 'hello',
        plugin: { id: '@brika/test', version: '1.0.0' },
      });
    });

    it('should send multiple messages', () => {
      channel.send(hello, { plugin: { id: 'test', version: '1.0' } });
      channel.send(ready, {});

      expect(sent).toHaveLength(2);
      expect(sent[0]?.t).toBe('hello');
      expect(sent[1]?.t).toBe('ready');
    });
  });

  describe('on', () => {
    it('should dispatch to message handlers', async () => {
      const handler = mock(() => {
        /* handler */
      });
      channel.on(hello, handler);

      await channel.handle({
        t: 'hello',
        plugin: { id: 'test', version: '1.0' },
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        plugin: { id: 'test', version: '1.0' },
      });
    });

    it('should allow unsubscribe', async () => {
      const handler = mock(() => {
        /* handler */
      });
      const unsub = channel.on(hello, handler);

      await channel.handle({ t: 'hello', plugin: { id: 'a', version: '1' } });
      unsub();
      await channel.handle({ t: 'hello', plugin: { id: 'b', version: '1' } });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('implement + handle RPC', () => {
    it('should handle RPC requests and send response', async () => {
      channel.implement(callTool, ({ tool }) => {
        return { ok: true, content: `Called ${tool}` };
      });

      await channel.handle({
        t: 'callTool',
        _id: 1,
        tool: 'timer:set',
        args: { duration: 5000 },
        ctx: { traceId: 'abc', source: 'api' },
      });

      expect(sent).toHaveLength(1);
      expect(sent[0]).toEqual({
        t: 'callToolResult',
        _id: 1,
        result: { ok: true, content: 'Called timer:set' },
      });
    });

    it('should handle errors in RPC handlers', async () => {
      channel.implement(callTool, () => {
        throw new Error('Test error');
      });

      await channel.handle({
        t: 'callTool',
        _id: 1,
        tool: 'test',
        args: {},
        ctx: { traceId: 'x', source: 'api' },
      });

      expect(sent).toHaveLength(1);
      expect(sent[0]?.t).toBe('callToolResult');
      expect(((sent[0] as Record<string, unknown>)?.result as { ok: boolean })?.ok).toBe(false);
    });

    it('should serialize RpcError with code on the wire', async () => {
      channel.implement(callTool, () => {
        throw new RpcError('PERMISSION_DENIED', 'Permission required', {
          permission: 'location',
        });
      });

      await channel.handle({
        t: 'callTool',
        _id: 1,
        tool: 'test',
        args: {},
        ctx: { traceId: 'x', source: 'api' },
      });

      expect(sent).toHaveLength(1);
      const result = (sent[0] as Record<string, unknown>)?.result;
      expect(isRpcErrorWire(result)).toBe(true);
      expect((result as { code: string }).code).toBe('PERMISSION_DENIED');
      expect((result as { message: string }).message).toBe('Permission required');
      expect((result as { data: Record<string, unknown> }).data).toEqual({
        permission: 'location',
      });
    });
  });

  describe('call RPC', () => {
    it('should send RPC request and resolve on response', async () => {
      const promise = channel.call(callTool, {
        tool: 'test',
        args: {},
        ctx: { traceId: 't', source: 'api' },
      });

      // Verify request was sent
      expect(sent).toHaveLength(1);
      expect(sent[0]?.t).toBe('callTool');
      expect((sent[0] as { _id?: number })?._id).toBe(1);

      // Simulate response
      await channel.handle({
        t: 'callToolResult',
        _id: 1,
        result: { ok: true, content: 'success' },
      });

      const result = await promise;
      expect(result).toEqual({ ok: true, content: 'success' });
    });

    it('should timeout if no response', () => {
      const promise = channel.call(
        ping,
        { ts: Date.now() },
        10 // 10ms timeout
      );

      expect(promise).rejects.toThrow(/timeout/i);
    });

    it('should reject with RpcError when response contains typed error', async () => {
      const promise = channel.call(callTool, {
        tool: 'test',
        args: {},
        ctx: { traceId: 't', source: 'api' },
      });

      // Simulate an RpcError response from the server (with data)
      await channel.handle({
        t: 'callToolResult',
        _id: 1,
        result: {
          _rpcError: true,
          code: 'PERMISSION_DENIED',
          message: 'Permission required',
          data: { permission: 'location' },
        },
      });

      try {
        await promise;
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RpcError);
        expect((err as RpcError).code).toBe('PERMISSION_DENIED');
        expect((err as RpcError).message).toBe('Permission required');
        expect((err as RpcError).data).toEqual({ permission: 'location' });
      }
    });

    it('should reject with RpcError preserving custom error codes', async () => {
      const promise = channel.call(callTool, {
        tool: 'test',
        args: {},
        ctx: { traceId: 't', source: 'api' },
      });

      await channel.handle({
        t: 'callToolResult',
        _id: 1,
        result: { _rpcError: true, code: 'NOT_FOUND', message: 'Block xyz not found' },
      });

      try {
        await promise;
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RpcError);
        expect((err as RpcError).code).toBe('NOT_FOUND');
        expect((err as RpcError).message).toBe('Block xyz not found');
      }
    });
  });

  describe('close', () => {
    it('should reject pending requests on close', () => {
      const promise = channel.call(callTool, {
        tool: 'test',
        args: {},
        ctx: { traceId: 't', source: 'api' },
      });

      channel.close(new Error('Test close'));

      expect(promise).rejects.toThrow('Test close');
      expect(channel.isClosed).toBe(true);
    });

    it('should not send after close', () => {
      channel.close();
      channel.send(hello, { plugin: { id: 'x', version: '1' } });

      expect(sent).toHaveLength(0);
    });
  });
});

describe('RpcError', () => {
  it('should create error with code and message', () => {
    const err = new RpcError('PERMISSION_DENIED', 'location');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RpcError);
    expect(err.name).toBe('RpcError');
    expect(err.code).toBe('PERMISSION_DENIED');
    expect(err.message).toBe('location');
  });

  it('should serialize to wire format', () => {
    const err = new RpcError('NOT_FOUND', 'Block xyz');
    const wire = err.toWire();
    expect(wire).toEqual({
      _rpcError: true,
      code: 'NOT_FOUND',
      message: 'Block xyz',
    });
  });

  it('should reconstruct from wire format', () => {
    const wire = { _rpcError: true as const, code: 'INTERNAL', message: 'oops' };
    const err = RpcError.fromWire(wire);
    expect(err).toBeInstanceOf(RpcError);
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toBe('oops');
  });

  it('should carry structured data', () => {
    const err = new RpcError('PERMISSION_DENIED', 'Location permission required', {
      permission: 'location',
    });
    expect(err.data).toEqual({ permission: 'location' });
  });

  it('should serialize data to wire format', () => {
    const err = new RpcError('NOT_FOUND', 'Block xyz', { blockId: 'timer:set' });
    const wire = err.toWire();
    expect(wire).toEqual({
      _rpcError: true,
      code: 'NOT_FOUND',
      message: 'Block xyz',
      data: { blockId: 'timer:set' },
    });
  });

  it('should omit data from wire when not provided', () => {
    const err = new RpcError('INTERNAL', 'oops');
    const wire = err.toWire();
    expect(wire.data).toBeUndefined();
  });

  it('should round-trip correctly without data', () => {
    const original = new RpcError('PERMISSION_DENIED', 'location');
    const restored = RpcError.fromWire(original.toWire());
    expect(restored.code).toBe(original.code);
    expect(restored.message).toBe(original.message);
    expect(restored.data).toBeUndefined();
  });

  it('should round-trip correctly with data', () => {
    const original = new RpcError('PERMISSION_DENIED', 'Permission required', {
      permission: 'location',
      plugin: '@brika/weather',
    });
    const restored = RpcError.fromWire(original.toWire());
    expect(restored.code).toBe(original.code);
    expect(restored.message).toBe(original.message);
    expect(restored.data).toEqual(original.data);
  });
});

describe('isRpcErrorWire', () => {
  it('should detect valid wire errors', () => {
    expect(isRpcErrorWire({ _rpcError: true, code: 'X', message: 'Y' })).toBe(true);
  });

  it('should reject non-objects', () => {
    expect(isRpcErrorWire(null)).toBe(false);
    expect(isRpcErrorWire(undefined)).toBe(false);
    expect(isRpcErrorWire('string')).toBe(false);
    expect(isRpcErrorWire(42)).toBe(false);
  });

  it('should reject objects without _rpcError flag', () => {
    expect(isRpcErrorWire({ code: 'X', message: 'Y' })).toBe(false);
    expect(isRpcErrorWire({ _rpcError: false, code: 'X', message: 'Y' })).toBe(false);
  });

  it('should reject objects with missing fields', () => {
    expect(isRpcErrorWire({ _rpcError: true, code: 'X' })).toBe(false);
    expect(isRpcErrorWire({ _rpcError: true, message: 'Y' })).toBe(false);
  });

  it('should reject objects with wrong field types', () => {
    expect(isRpcErrorWire({ _rpcError: true, code: 123, message: 'Y' })).toBe(false);
    expect(isRpcErrorWire({ _rpcError: true, code: 'X', message: 123 })).toBe(false);
  });

  it('should not confuse regular { ok: false } errors with RpcError', () => {
    expect(isRpcErrorWire({ ok: false, error: 'something failed' })).toBe(false);
  });
});

describe('Schema validation', () => {
  it('should validate ToolResult', () => {
    const valid = ToolResult.safeParse({ ok: true, content: 'done' });
    expect(valid.success).toBe(true);

    const invalid = ToolResult.safeParse({ ok: 'yes' });
    expect(invalid.success).toBe(false);
  });

  it('should validate PluginInfo', () => {
    const valid = PluginInfo.safeParse({
      id: '@brika/test',
      version: '1.0.0',
      requires: { hub: '>=1.0.0' },
    });
    expect(valid.success).toBe(true);

    const minimal = PluginInfo.safeParse({
      id: 'test',
      version: '0.1.0',
    });
    expect(minimal.success).toBe(true);
  });
});
