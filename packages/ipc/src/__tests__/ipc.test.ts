import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { Channel, type WireMessage } from '../channel';
import { callTool, hello, PluginInfo, ping, ready, ToolResult } from '../contract';
import { isMessage, isRpc, message, rpc } from '../define';

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
        plugin: { id: '@elia/test', version: '1.0.0' },
      });

      expect(sent).toHaveLength(1);
      expect(sent[0]).toEqual({
        t: 'hello',
        plugin: { id: '@elia/test', version: '1.0.0' },
      });
    });

    it('should send multiple messages', () => {
      channel.send(hello, { plugin: { id: 'test', version: '1.0' } });
      channel.send(ready, {});

      expect(sent).toHaveLength(2);
      expect(sent[0].t).toBe('hello');
      expect(sent[1].t).toBe('ready');
    });
  });

  describe('on', () => {
    it('should dispatch to message handlers', async () => {
      const handler = mock(() => {});
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
      const handler = mock(() => {});
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
      channel.implement(callTool, async () => {
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
      expect(sent[0].t).toBe('callToolResult');
      // biome-ignore lint/suspicious/noExplicitAny: test assertion
      expect((sent[0] as any).result.ok).toBe(false);
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
      expect(sent[0].t).toBe('callTool');
      expect(sent[0]._id).toBe(1);

      // Simulate response
      await channel.handle({
        t: 'callToolResult',
        _id: 1,
        result: { ok: true, content: 'success' },
      });

      const result = await promise;
      expect(result).toEqual({ ok: true, content: 'success' });
    });

    it('should timeout if no response', async () => {
      const promise = channel.call(
        ping,
        { ts: Date.now() },
        10 // 10ms timeout
      );

      await expect(promise).rejects.toThrow(/timeout/i);
    });
  });

  describe('close', () => {
    it('should reject pending requests on close', async () => {
      const promise = channel.call(callTool, {
        tool: 'test',
        args: {},
        ctx: { traceId: 't', source: 'api' },
      });

      channel.close(new Error('Test close'));

      await expect(promise).rejects.toThrow('Test close');
      expect(channel.isClosed).toBe(true);
    });

    it('should not send after close', () => {
      channel.close();
      channel.send(hello, { plugin: { id: 'x', version: '1' } });

      expect(sent).toHaveLength(0);
    });
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
      id: '@elia/test',
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
