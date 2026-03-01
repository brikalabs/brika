/**
 * Tests for WorkflowRuntime
 */

import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { type BlockRegistry, type ToolExecutor, WorkflowRuntime } from '../engine/workflow-runtime';
import type { Serializable } from '../serialization';
import type { BlockInstance, CompiledBlock, Workflow } from '../types';

// Mock block type
const createMockBlockType = (): CompiledBlock => ({
  id: 'mock-block',
  nameKey: 'blocks.mock',
  descriptionKey: 'blocks.mock.description',
  category: 'test',
  icon: 'box',
  color: '#888888',
  inputs: [
    {
      id: 'input',
      direction: 'input',
      nameKey: 'ports.input',
      schema: z.unknown(),
    },
  ],
  outputs: [
    {
      id: 'output',
      direction: 'output',
      nameKey: 'ports.output',
      schema: z.unknown(),
    },
  ],
  configSchema: z.object({
    value: z.string().optional(),
  }),
  start: (ctx) => {
    const instance: BlockInstance = {
      pushInput: (portId, data) => {
        // Echo input to output
        ctx.emit('output', data);
      },
      stop: () => undefined,
    };
    return instance;
  },
});

// Create test workflow
const createTestWorkflow = (
  blocks: {
    id: string;
    type: string;
    config?: unknown;
  }[] = []
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
    type: b.type,
    config: (b.config ?? {}) as Record<string, unknown>,
    position: {
      x: 0,
      y: 0,
    },
    inputs: {},
    outputs: {},
  })),
});

// Mock block registry
const createMockRegistry = (blocks: Map<string, CompiledBlock>): BlockRegistry => ({
  get: (type) => blocks.get(type),
});

describe('WorkflowRuntime', () => {
  describe('constructor', () => {
    test('creates runtime with valid blocks', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);

      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      expect(runtime.isRunning).toBe(false);
    });

    test('throws for unknown block type', () => {
      const registry = createMockRegistry(new Map());
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'unknown-type',
        },
      ]);

      expect(
        () =>
          new WorkflowRuntime(workflow, {
            blocks: registry,
          })
      ).toThrow('Unknown block type');
    });

    test('throws for invalid block config', () => {
      const blockType: CompiledBlock = {
        ...createMockBlockType(),
        configSchema: z.object({
          required: z.string(),
        }),
      };
      const registry = createMockRegistry(new Map([['strict-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'strict-block',
          config: {},
        },
      ]);

      expect(
        () =>
          new WorkflowRuntime(workflow, {
            blocks: registry,
          })
      ).toThrow('Invalid config');
    });
  });

  describe('start/stop', () => {
    test('starts workflow and sets running state', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.start();

      expect(runtime.isRunning).toBe(true);
      expect(runtime.getBlockState('block-1')).toBe('running');
    });

    test('stops workflow', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.start();
      runtime.stop();

      expect(runtime.isRunning).toBe(false);
      expect(runtime.getBlockState('block-1')).toBe('stopped');
    });

    test('start is idempotent', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.start();
      runtime.start(); // Second call should be no-op

      expect(runtime.isRunning).toBe(true);
    });

    test('stop is idempotent', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.stop(); // Should not throw
      runtime.start();
      runtime.stop();
      runtime.stop(); // Second call should be no-op

      expect(runtime.isRunning).toBe(false);
    });
  });

  describe('pauseBlock/resumeBlock', () => {
    test('pauses a running block', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.start();
      runtime.pauseBlock('block-1');

      expect(runtime.getBlockState('block-1')).toBe('paused');
    });

    test('resumes a paused block', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.start();
      runtime.pauseBlock('block-1');
      runtime.resumeBlock('block-1');

      expect(runtime.getBlockState('block-1')).toBe('running');
    });

    test('does not pause stopped block', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.pauseBlock('block-1'); // Before start

      expect(runtime.getBlockState('block-1')).toBe('stopped');
    });
  });

  describe('stopBlock', () => {
    test('stops a specific block', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
        {
          id: 'block-2',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.start();
      runtime.stopBlock('block-1');

      expect(runtime.getBlockState('block-1')).toBe('stopped');
      expect(runtime.getBlockState('block-2')).toBe('running');
    });

    test('handles stopping non-existent block', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      // Should not throw
      runtime.stopBlock('non-existent');
    });
  });

  describe('getBlockStates', () => {
    test('returns all block states', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
        {
          id: 'block-2',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.start();

      const states = runtime.getBlockStates();

      expect(states.size).toBe(2);
      expect(states.get('block-1')).toBe('running');
      expect(states.get('block-2')).toBe('running');
    });
  });

  describe('callbacks', () => {
    test('calls onBlockStateChange callback', () => {
      const stateChanges: {
        blockId: string;
        state: string;
      }[] = [];
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
        onBlockStateChange: (blockId, state) =>
          stateChanges.push({
            blockId,
            state,
          }),
      });

      runtime.start();
      runtime.stop();

      expect(stateChanges).toContainEqual({
        blockId: 'block-1',
        state: 'running',
      });
      expect(stateChanges).toContainEqual({
        blockId: 'block-1',
        state: 'stopped',
      });
    });

    test('calls onLog callback', () => {
      const logs: {
        blockId: string;
        level: string;
        message: string;
      }[] = [];
      let capturedLog: (level: 'debug' | 'info' | 'warn' | 'error', msg: string) => void = () =>
        undefined;

      const blockType: CompiledBlock = {
        ...createMockBlockType(),
        start: (ctx) => {
          capturedLog = ctx.log;
          return {
            pushInput: () => undefined,
            stop: () => undefined,
          };
        },
      };
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
        onLog: (blockId, level, message) =>
          logs.push({
            blockId,
            level,
            message,
          }),
      });

      runtime.start();
      capturedLog('info', 'Test message');

      expect(logs).toContainEqual({
        blockId: 'block-1',
        level: 'info',
        message: 'Test message',
      });
    });
  });

  describe('tools', () => {
    test('callTool rejects when no executor configured', async () => {
      let capturedCallTool: (
        toolId: string,
        args: Record<string, Serializable>
      ) => Promise<Serializable> = () => Promise.resolve(null);

      const blockType: CompiledBlock = {
        ...createMockBlockType(),
        start: (ctx) => {
          capturedCallTool = ctx.callTool;
          return {
            pushInput: () => undefined,
            stop: () => undefined,
          };
        },
      };
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.start();

      await expect(capturedCallTool('test-tool', {})).rejects.toThrow('No tool executor');
    });

    test('callTool calls executor when configured', async () => {
      let capturedCallTool: (
        toolId: string,
        args: Record<string, Serializable>
      ) => Promise<Serializable> = () => Promise.resolve(null);

      const blockType: CompiledBlock = {
        ...createMockBlockType(),
        start: (ctx) => {
          capturedCallTool = ctx.callTool;
          return {
            pushInput: () => undefined,
            stop: () => undefined,
          };
        },
      };
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const tools: ToolExecutor = {
        call: async (toolId) => ({
          result: toolId,
        }),
      };
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
        tools,
      });

      runtime.start();

      const result = await capturedCallTool('my-tool', {});
      expect(result).toEqual({
        result: 'my-tool',
      });
    });
  });

  describe('eventBus', () => {
    test('exposes event bus', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      expect(runtime.eventBus).toBeDefined();
    });

    test('observe returns unsubscribe function', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      const unsubscribe = runtime.observe(() => undefined);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('port buffers', () => {
    test('getAllPortBuffers returns empty initially', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      expect(runtime.getAllPortBuffers()).toEqual([]);
    });

    test('getPortBuffer returns undefined for unknown port', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      expect(runtime.getPortBuffer('block-1', 'unknown')).toBeUndefined();
    });

    test('retrigger returns false for unknown port', async () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      const result = await runtime.retrigger('block-1', 'unknown');
      expect(result).toBe(false);
    });

    test('inject injects data into port', async () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      await runtime.inject('block-1', 'input', {
        test: 'data',
      });

      const buffer = runtime.getPortBuffer('block-1', 'input');
      expect(buffer?.value).toEqual({
        test: 'data',
      });
    });
  });

  describe('event handling', () => {
    test('emit does nothing when workflow not running', () => {
      let emitCalled = false;
      let capturedEmit: (portId: string, data: Serializable) => void = () => undefined;

      const blockType: CompiledBlock = {
        ...createMockBlockType(),
        start: (ctx) => {
          capturedEmit = ctx.emit;
          return {
            pushInput: () => {
              emitCalled = true;
            },
            stop: () => undefined,
          };
        },
      };
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.start();
      runtime.stop();

      // Try to emit after stop
      capturedEmit('output', {
        test: 'data',
      });

      // Should not have called pushInput
      expect(emitCalled).toBe(false);
    });

    test('emit does nothing when block not running', () => {
      let emitCalled = false;
      let capturedEmit: (portId: string, data: Serializable) => void = () => undefined;

      const blockType: CompiledBlock = {
        ...createMockBlockType(),
        start: (ctx) => {
          capturedEmit = ctx.emit;
          return {
            pushInput: () => {
              emitCalled = true;
            },
            stop: () => undefined,
          };
        },
      };
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.start();
      runtime.pauseBlock('block-1');

      // Try to emit when paused
      capturedEmit('output', {
        test: 'data',
      });

      // Should not have called pushInput
      expect(emitCalled).toBe(false);
    });

    test('buffers events for paused blocks', async () => {
      const pushInputCalls: unknown[] = [];

      const blockType: CompiledBlock = {
        ...createMockBlockType(),
        start: () => ({
          pushInput: (_portId, data) => {
            pushInputCalls.push(data);
          },
          stop: () => undefined,
        }),
      };
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));

      // Create workflow with connection
      const workflow: Workflow = {
        version: '1.0',
        workspace: {
          id: 'test',
          name: 'Test',
          enabled: true,
        },
        plugins: {},
        blocks: [
          {
            id: 'source',
            type: 'mock-block',
            config: {} as Record<string, unknown>,
            position: {
              x: 0,
              y: 0,
            },
            inputs: {},
            outputs: {
              output: 'target:input',
            },
          },
          {
            id: 'target',
            type: 'mock-block',
            config: {} as Record<string, unknown>,
            position: {
              x: 100,
              y: 0,
            },
            inputs: {},
            outputs: {},
          },
        ],
      };

      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });
      runtime.start();

      // Pause target block
      runtime.pauseBlock('target');

      // Inject data to source's output (should be buffered by target)
      await runtime.inject('source', 'output', {
        value: 1,
      });
      await runtime.inject('source', 'output', {
        value: 2,
      });

      // Target should not have received events yet
      expect(pushInputCalls).toHaveLength(0);

      // Resume target
      runtime.resumeBlock('target');

      // Now target should have received buffered events
      expect(pushInputCalls).toHaveLength(2);
      expect(pushInputCalls[0]).toEqual({
        value: 1,
      });
      expect(pushInputCalls[1]).toEqual({
        value: 2,
      });
    });

    test('ignores events to stopped blocks', async () => {
      let pushInputCalls = 0;

      const blockType: CompiledBlock = {
        ...createMockBlockType(),
        start: () => ({
          pushInput: () => {
            pushInputCalls++;
          },
          stop: () => undefined,
        }),
      };
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));

      const workflow: Workflow = {
        version: '1.0',
        workspace: {
          id: 'test',
          name: 'Test',
          enabled: true,
        },
        plugins: {},
        blocks: [
          {
            id: 'source',
            type: 'mock-block',
            config: {} as Record<string, unknown>,
            position: {
              x: 0,
              y: 0,
            },
            inputs: {},
            outputs: {
              output: 'target:input',
            },
          },
          {
            id: 'target',
            type: 'mock-block',
            config: {} as Record<string, unknown>,
            position: {
              x: 100,
              y: 0,
            },
            inputs: {},
            outputs: {},
          },
        ],
      };

      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });
      runtime.start();
      runtime.stopBlock('target');

      // Inject data to source's output
      await runtime.inject('source', 'output', {
        value: 1,
      });

      // Target should not have received the event
      expect(pushInputCalls).toBe(0);
    });

    test('resume does nothing for non-paused block', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.start();

      // Try to resume a running block (should be no-op)
      runtime.resumeBlock('block-1');

      expect(runtime.getBlockState('block-1')).toBe('running');
    });

    test('resume does nothing for non-existent block', () => {
      const blockType = createMockBlockType();
      const registry = createMockRegistry(new Map([['mock-block', blockType]]));
      const workflow = createTestWorkflow([
        {
          id: 'block-1',
          type: 'mock-block',
        },
      ]);
      const runtime = new WorkflowRuntime(workflow, {
        blocks: registry,
      });

      runtime.start();

      // Should not throw
      runtime.resumeBlock('non-existent');
    });
  });
});
