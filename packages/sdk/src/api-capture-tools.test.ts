/**
 * Tests for the capture and tools APIs (thin context delegates).
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { z } from 'zod';

const mockCapture = mock(
  (_name: string, _props?: Record<string, unknown>, _distinctId?: string) => {}
);
const mockRegisterTool = mock(
  (_definition: Record<string, unknown>, _handler: (...args: unknown[]) => unknown) => {}
);

mock.module('./context', () => ({
  getContext: () => ({
    capture: mockCapture,
    registerTool: mockRegisterTool,
  }),
}));

const { capture } = await import('./api/capture');
const { defineRawTool, defineTool } = await import('./api/tools');

describe('capture', () => {
  beforeEach(() => {
    mockCapture.mockClear();
  });

  test('delegates event name to context.capture', () => {
    capture('feature.used');
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const call = mockCapture.mock.calls[0];
    expect(call?.[0]).toBe('feature.used');
  });

  test('passes props and distinctId to context.capture', () => {
    capture('timer.started', { durationMs: 5000 }, 'user-abc');
    const call = mockCapture.mock.calls[0];
    expect(call?.[1]).toEqual({ durationMs: 5000 });
    expect(call?.[2]).toBe('user-abc');
  });

  test('works without optional props', () => {
    capture('page.viewed');
    const call = mockCapture.mock.calls[0];
    expect(call?.[0]).toBe('page.viewed');
    expect(call?.[1]).toBeUndefined();
    expect(call?.[2]).toBeUndefined();
  });

  test('passes complex props through', () => {
    capture('integration.connected', { provider: 'spotify', userId: 123 });
    const call = mockCapture.mock.calls[0];
    expect(call?.[1]).toEqual({ provider: 'spotify', userId: 123 });
  });
});

describe('defineTool', () => {
  beforeEach(() => {
    mockRegisterTool.mockClear();
  });

  test('delegates to context.registerTool with definition and handler', () => {
    const handler = async (args: Record<string, unknown>) => `result: ${JSON.stringify(args)}`;
    defineRawTool({ id: 'my-tool', description: 'A test tool' }, handler);

    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    const call = mockRegisterTool.mock.calls[0];
    expect(call?.[0]).toEqual({ id: 'my-tool', description: 'A test tool' });
    expect(typeof call?.[1]).toBe('function');
  });

  test('passes full ToolDefinition fields through', () => {
    const handler = async () => null;
    defineRawTool(
      {
        id: 'full-tool',
        description: 'Full definition',
        icon: 'ZapIcon',
        color: '#ff0000',
        inputSchema: {
          type: 'object',
          properties: { on: { type: 'boolean' } },
          required: ['on'],
        },
      },
      handler
    );

    const call = mockRegisterTool.mock.calls[0];
    const def = call?.[0] as {
      id: string;
      description: string;
      icon: string;
      color: string;
      inputSchema: { type: string };
    };
    expect(def.id).toBe('full-tool');
    expect(def.icon).toBe('ZapIcon');
    expect(def.color).toBe('#ff0000');
    expect(def.inputSchema?.type).toBe('object');
  });

  test('works with minimal definition (only id)', () => {
    const handler = async () => 'ok';
    defineRawTool({ id: 'minimal-tool' }, handler);
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    const call = mockRegisterTool.mock.calls[0];
    expect((call?.[0] as { id: string }).id).toBe('minimal-tool');
  });

  test('handler passed through is callable', () => {
    const innerHandler = mock(async () => 'called');
    defineRawTool({ id: 'callable-tool' }, innerHandler);
    const call = mockRegisterTool.mock.calls[0];
    const registeredHandler = call?.[1] as (...args: unknown[]) => unknown;
    expect(typeof registeredHandler).toBe('function');
  });
});

describe('defineTool (typed input)', () => {
  test('derives the JSON schema from zod and parses args before the handler', async () => {
    mockRegisterTool.mockClear();
    const seen: unknown[] = [];
    defineTool(
      {
        id: 'typed-tool',
        description: 'Typed',
        input: z.object({
          query: z.string().describe('What to search'),
          limit: z.number().int().min(1).max(50).default(10),
        }),
      },
      (args) => {
        seen.push(args);
        return { ok: true };
      }
    );

    const call = mockRegisterTool.mock.calls[0];
    const definition = z
      .object({
        id: z.string(),
        inputSchema: z.object({
          type: z.string(),
          properties: z.record(z.string(), z.unknown()).optional(),
          required: z.array(z.string()).optional(),
        }),
      })
      .parse(call?.[0]);
    expect(definition.id).toBe('typed-tool');
    expect(definition.inputSchema.type).toBe('object');
    expect(Object.keys(definition.inputSchema.properties ?? {})).toEqual(['query', 'limit']);
    expect(definition.inputSchema.required).toEqual(['query']);

    const handler = call?.[1];
    await handler?.({ query: 'jazz' }, { traceId: 't', source: 'test' });
    expect(seen).toEqual([{ query: 'jazz', limit: 10 }]);
  });

  test('rejects invalid args with a clear error before the handler runs', async () => {
    mockRegisterTool.mockClear();
    let ran = false;
    defineTool({ id: 'strict-tool', input: z.object({ n: z.number() }) }, () => {
      ran = true;
      return null;
    });
    const handler = mockRegisterTool.mock.calls[0]?.[1];
    expect(() => handler?.({ n: 'NaN' }, { traceId: 't', source: 'test' })).toThrow(
      'Invalid arguments for "strict-tool"'
    );
    expect(ran).toBeFalse();
  });
});
