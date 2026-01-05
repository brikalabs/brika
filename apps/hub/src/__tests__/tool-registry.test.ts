import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Json, ToolCallContext, ToolResult } from '@brika/shared';
import { spy, TestBed } from '@brika/shared';
import { HubConfig } from '@/runtime/config';
import { LogRouter } from '@/runtime/logs/log-router';
import { ToolRegistry } from '@/runtime/tools/tool-registry';

describe('ToolRegistry', () => {
  // Spies for assertions
  const infoSpy = spy<[string, object?]>();
  const errorSpy = spy<[string, object?]>();

  beforeEach(() => {
    // Reset spies
    infoSpy.reset();
    errorSpy.reset();

    // Modern fluent API
    TestBed.create()
      .provide(HubConfig, new HubConfig())
      .mock(LogRouter, {
        info: infoSpy,
        error: errorSpy,
        warn: spy(),
        debug: spy(),
      })
      .compile();
  });

  afterEach(() => TestBed.reset());

  it('should register a tool', () => {
    const registry = TestBed.get(ToolRegistry);

    registry.register('tool', 'test', {
      description: 'A test tool',
    });

    const tools = registry.list();
    expect(tools).toHaveLength(1);
    expect(tools[0].id).toBe('test:tool');
  });

  it('should log on register', () => {
    const registry = TestBed.get(ToolRegistry);

    registry.register('tool', 'plugin', {});

    expect(infoSpy.called).toBe(true);
    expect(infoSpy.lastCall?.[0]).toBe('tool.register');
  });

  it('should prevent duplicate registration', () => {
    const registry = TestBed.get(ToolRegistry);

    registry.register('tool', 'owner', {});

    expect(() => {
      registry.register('tool', 'owner', {});
    }).toThrow('Tool already registered: owner:tool');
  });

  it('should unregister a tool', () => {
    const registry = TestBed.get(ToolRegistry);

    registry.register('tool', 'test', {});

    expect(registry.list()).toHaveLength(1);
    registry.unregister('test:tool');
    expect(registry.list()).toHaveLength(0);
  });

  it('should unregister by owner', () => {
    const registry = TestBed.get(ToolRegistry);

    registry.register('a', 'plugin1', {});
    registry.register('b', 'plugin1', {});
    registry.register('c', 'plugin2', {});

    expect(registry.list()).toHaveLength(3);
    registry.unregisterByOwner('plugin1');

    const remaining = registry.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('plugin2:c');
  });

  it('should call a tool via the tool caller', async () => {
    const registry = TestBed.get(ToolRegistry);
    const handler = spy<
      [string, string, Record<string, Json>, ToolCallContext],
      Promise<ToolResult>
    >();
    handler.mockResolvedValue({ ok: true, content: 'success' });

    // Set up tool caller
    registry.setToolCaller(handler);

    registry.register('tool', 'test', {});

    const result = await registry.call(
      'test:tool',
      { arg: 'value' },
      { traceId: '123', source: 'api' }
    );

    expect(result.ok).toBe(true);
    expect(result.content).toBe('success');
    expect(handler.called).toBe(true);
    // Handler receives: owner, toolId, args, ctx
    expect(handler.lastCall?.[0]).toBe('test');
    expect(handler.lastCall?.[1]).toBe('tool');
    expect(handler.lastCall?.[2]).toEqual({ arg: 'value' });
  });

  it('should return error for unknown tool', async () => {
    const registry = TestBed.get(ToolRegistry);
    const result = await registry.call('unknown', {}, { traceId: '123', source: 'api' });

    expect(result.ok).toBe(false);
    expect(result.content).toContain('Unknown tool');
  });

  it('should return error if tool caller not configured', async () => {
    const registry = TestBed.get(ToolRegistry);
    registry.register('tool', 'test', {});

    const result = await registry.call('test:tool', {}, { traceId: '123', source: 'api' });

    expect(result.ok).toBe(false);
    expect(result.content).toContain('Tool caller not configured');
  });
});
