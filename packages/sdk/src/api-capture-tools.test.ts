/**
 * Tests for the capture and tools APIs (thin context delegates).
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';

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
const { defineTool } = await import('./api/tools');

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
    defineTool({ id: 'my-tool', description: 'A test tool' }, handler);

    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    const call = mockRegisterTool.mock.calls[0];
    expect(call?.[0]).toEqual({ id: 'my-tool', description: 'A test tool' });
    expect(typeof call?.[1]).toBe('function');
  });

  test('passes full ToolDefinition fields through', () => {
    const handler = async () => null;
    defineTool(
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
    defineTool({ id: 'minimal-tool' }, handler);
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    const call = mockRegisterTool.mock.calls[0];
    expect((call?.[0] as { id: string }).id).toBe('minimal-tool');
  });

  test('handler passed through is callable', () => {
    const innerHandler = mock(async () => 'called');
    defineTool({ id: 'callable-tool' }, innerHandler);
    const call = mockRegisterTool.mock.calls[0];
    const registeredHandler = call?.[1] as (...args: unknown[]) => unknown;
    expect(typeof registeredHandler).toBe('function');
  });
});
