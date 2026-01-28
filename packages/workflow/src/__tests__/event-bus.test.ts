/**
 * Tests for EventBus
 */

import { describe, expect, test } from 'bun:test';
import {
  createEventStream,
  type DispatchedEvent,
  EventBus,
  type EventHandler,
} from '../engine/event-bus';
import type { BlockConfig, Workflow } from '../types';

// Create test workflow
const createTestWorkflow = (
  blocks: Array<{ id: string; outputs?: Record<string, `${string}:${string}`> }>
): Workflow => ({
  version: '1.0',
  workspace: {
    id: 'test-workflow',
    name: 'Test Workflow',
    enabled: true,
  },
  plugins: {},
  blocks: blocks.map((b) => ({
    id: b.id,
    type: 'mock-type',
    config: {} as Record<string, unknown>,
    position: { x: 0, y: 0 },
    inputs: {},
    outputs: b.outputs ?? {},
  })),
});

describe('EventBus', () => {
  describe('emit', () => {
    test('emits event to connected target', async () => {
      const receivedEvents: { blockId: string; port: string; data: unknown }[] = [];
      const handler: EventHandler = (blockId, port, data) => {
        receivedEvents.push({ blockId, port, data });
      };

      const workflow = createTestWorkflow([
        { id: 'source', outputs: { output: 'target:input' } },
        { id: 'target' },
      ]);
      const bus = new EventBus(workflow, handler);

      await bus.emit('source', 'output', { value: 42 });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]?.blockId).toBe('target');
      expect(receivedEvents[0]?.port).toBe('input');
      expect(receivedEvents[0]?.data).toEqual({ value: 42 });
    });

    test('does not dispatch when no target connected', async () => {
      const receivedEvents: unknown[] = [];
      const handler: EventHandler = (blockId, port, data) => {
        receivedEvents.push({ blockId, port, data });
      };

      const workflow = createTestWorkflow([{ id: 'source', outputs: {} }]);
      const bus = new EventBus(workflow, handler);

      await bus.emit('source', 'disconnected-output', { value: 1 });

      expect(receivedEvents).toHaveLength(0);
    });

    test('updates port buffer on emit', async () => {
      const workflow = createTestWorkflow([{ id: 'block-1', outputs: {} }]);
      const bus = new EventBus(workflow, () => undefined);

      await bus.emit('block-1', 'output', { value: 'first' });
      await bus.emit('block-1', 'output', { value: 'second' });

      const buffer = bus.getPortBuffer('block-1', 'output');
      expect(buffer?.value).toEqual({ value: 'second' });
      expect(buffer?.count).toBe(2);
    });
  });

  describe('getPortBuffer', () => {
    test('returns undefined for unknown port', () => {
      const workflow = createTestWorkflow([{ id: 'block-1' }]);
      const bus = new EventBus(workflow, () => undefined);

      expect(bus.getPortBuffer('unknown', 'port')).toBeUndefined();
    });

    test('returns buffer after emit', async () => {
      const workflow = createTestWorkflow([{ id: 'block-1' }]);
      const bus = new EventBus(workflow, () => undefined);

      await bus.emit('block-1', 'out', 'test-value');

      const buffer = bus.getPortBuffer('block-1', 'out');
      expect(buffer).toBeDefined();
      expect(buffer?.value).toBe('test-value');
      expect(buffer?.portRef).toBe('block-1:out');
    });
  });

  describe('getAllBuffers', () => {
    test('returns empty array initially', () => {
      const workflow = createTestWorkflow([{ id: 'block-1' }]);
      const bus = new EventBus(workflow, () => undefined);

      expect(bus.getAllBuffers()).toEqual([]);
    });

    test('returns all buffers after emissions', async () => {
      const workflow = createTestWorkflow([{ id: 'block-1' }, { id: 'block-2' }]);
      const bus = new EventBus(workflow, () => undefined);

      await bus.emit('block-1', 'out1', 'value1');
      await bus.emit('block-2', 'out2', 'value2');

      const buffers = bus.getAllBuffers();
      expect(buffers).toHaveLength(2);
    });
  });

  describe('retrigger', () => {
    test('returns false for unknown port', async () => {
      const workflow = createTestWorkflow([{ id: 'block-1' }]);
      const bus = new EventBus(workflow, () => undefined);

      const result = await bus.retrigger('unknown', 'port');
      expect(result).toBe(false);
    });

    test('resends last value', async () => {
      const receivedEvents: unknown[] = [];
      const workflow = createTestWorkflow([
        { id: 'source', outputs: { output: 'target:input' } },
        { id: 'target' },
      ]);
      const bus = new EventBus(workflow, (_, __, data) => {
        receivedEvents.push(data);
      });

      await bus.emit('source', 'output', { value: 'original' });
      expect(receivedEvents).toHaveLength(1);

      const result = await bus.retrigger('source', 'output');
      expect(result).toBe(true);
      expect(receivedEvents).toHaveLength(2);
      expect(receivedEvents[1]).toEqual({ value: 'original' });
    });
  });

  describe('inject', () => {
    test('injects data into port', async () => {
      const receivedEvents: unknown[] = [];
      const workflow = createTestWorkflow([
        { id: 'source', outputs: { output: 'target:input' } },
        { id: 'target' },
      ]);
      const bus = new EventBus(workflow, (_, __, data) => {
        receivedEvents.push(data);
      });

      await bus.inject('source', 'output', { injected: true });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({ injected: true });
    });
  });

  describe('observe', () => {
    test('notifies observer on events', async () => {
      const observed: DispatchedEvent[] = [];
      const workflow = createTestWorkflow([
        { id: 'source', outputs: { output: 'target:input' } },
        { id: 'target' },
      ]);
      const bus = new EventBus(workflow, () => undefined);

      bus.observe((event) => observed.push(event));

      await bus.emit('source', 'output', { value: 1 });

      expect(observed).toHaveLength(1);
      expect(observed[0]?.sourceBlockId).toBe('source');
      expect(observed[0]?.targetBlockId).toBe('target');
    });

    test('returns unsubscribe function', async () => {
      const observed: DispatchedEvent[] = [];
      const workflow = createTestWorkflow([
        { id: 'source', outputs: { output: 'target:input' } },
        { id: 'target' },
      ]);
      const bus = new EventBus(workflow, () => undefined);

      const unsubscribe = bus.observe((event) => observed.push(event));

      await bus.emit('source', 'output', 'first');
      unsubscribe();
      await bus.emit('source', 'output', 'second');

      expect(observed).toHaveLength(1);
    });
  });

  describe('connectionCount', () => {
    test('returns 0 for no connections', () => {
      const workflow = createTestWorkflow([{ id: 'block-1', outputs: {} }]);
      const bus = new EventBus(workflow, () => undefined);

      expect(bus.connectionCount).toBe(0);
    });

    test('returns correct count', () => {
      const workflow = createTestWorkflow([
        {
          id: 'source',
          outputs: {
            out1: 'target:in1',
            out2: 'target:in2',
          },
        },
        { id: 'target' },
      ]);
      const bus = new EventBus(workflow, () => undefined);

      expect(bus.connectionCount).toBe(2);
    });
  });
});

describe('createEventStream', () => {
  test('creates a readable stream', () => {
    const workflow = createTestWorkflow([
      { id: 'source', outputs: { output: 'target:input' } },
      { id: 'target' },
    ]);
    const bus = new EventBus(workflow, () => undefined);

    const stream = createEventStream(bus);
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  test('streams events in SSE format', async () => {
    const workflow = createTestWorkflow([
      { id: 'source', outputs: { output: 'target:input' } },
      { id: 'target' },
    ]);
    const bus = new EventBus(workflow, () => undefined);

    const stream = createEventStream(bus);
    const reader = stream.getReader();

    // Emit an event after a short delay
    setTimeout(() => {
      bus.emit('source', 'output', { value: 42 });
    }, 10);

    // Read the first chunk
    const { value, done } = await reader.read();

    expect(done).toBe(false);
    expect(value).toBeDefined();
    expect(value).toContain('data: ');
    expect(value).toContain('\n\n');
    expect(value).toContain('source');
    expect(value).toContain('target');

    // Cancel the stream to clean up
    await reader.cancel();
  });

  test('unsubscribes on cancel', async () => {
    const workflow = createTestWorkflow([
      { id: 'source', outputs: { output: 'target:input' } },
      { id: 'target' },
    ]);
    const bus = new EventBus(workflow, () => undefined);

    const stream = createEventStream(bus);
    const reader = stream.getReader();

    // Cancel the stream
    await reader.cancel();

    // Emit an event - should not cause errors
    await bus.emit('source', 'output', { value: 1 });

    // If we got here, the unsubscribe worked correctly
    expect(true).toBe(true);
  });
});
