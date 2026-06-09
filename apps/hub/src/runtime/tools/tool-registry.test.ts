import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import type { ToolCallContext, ToolDefinition } from '@brika/ipc/contract';
import { ToolRegistry } from './tool-registry';

const ctx: ToolCallContext = { traceId: 't', source: 'api' };
const def = (id: string): ToolDefinition => ({ id, description: `tool ${id}` });

describe('ToolRegistry', () => {
  test('registers, lists, gets, and dispatches a tool by id', async () => {
    const registry = new ToolRegistry();
    registry.register('plugin-a', def('echo'), async (args) => ({ ok: true, data: args }));

    // Ids are qualified with the owning plugin to avoid cross-plugin collisions.
    expect(registry.list().map((t) => t.id)).toEqual(['plugin-a:echo']);
    expect(registry.get('plugin-a:echo')?.description).toBe('tool echo');

    const result = await registry.call('plugin-a:echo', { hello: 'world' }, ctx);
    expect(result).toEqual({ ok: true, data: { hello: 'world' } });
  });

  test('returns a not-found result for an unknown tool', async () => {
    const registry = new ToolRegistry();
    const result = await registry.call('nope', {}, ctx);
    expect(result.ok).toBe(false);
    expect(result.content).toContain('not found');
  });

  test('unregisterPlugin drops only that plugin tools', () => {
    const registry = new ToolRegistry();
    registry.register('a', def('a1'), async () => ({ ok: true }));
    registry.register('a', def('a2'), async () => ({ ok: true }));
    registry.register('b', def('b1'), async () => ({ ok: true }));

    registry.unregisterPlugin('a');

    expect(registry.list().map((t) => t.id)).toEqual(['b:b1']);
  });

  test('re-registering an id overwrites the prior entry', async () => {
    const registry = new ToolRegistry();
    registry.register('a', def('x'), async () => ({ ok: true, content: 'first' }));
    registry.register('a', def('x'), async () => ({ ok: true, content: 'second' }));

    expect(registry.list()).toHaveLength(1);
    expect((await registry.call('a:x', {}, ctx)).content).toBe('second');
  });
});
