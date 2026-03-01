/**
 * Tests for WorkflowExecutor
 * Testing execution lifecycle, data flow, and event handling
 */
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { reset, stub, useTestBed } from '@brika/di/testing';
import { BlockRegistry } from '@/runtime/blocks';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import type { Workflow } from '@/runtime/workflows/types';
import type { ExecutionEvent, ExecutionListener } from '@/runtime/workflows/workflow-executor';
import { WorkflowExecutor } from '@/runtime/workflows/workflow-executor';
import type { Json } from '@/types';

useTestBed({
  autoStub: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createSimpleWorkflow = (id = 'test-workflow'): Workflow => ({
  id,
  name: `Workflow ${id}`,
  enabled: true,
  blocks: [
    {
      id: 'block-1',
      type: 'timer',
    },
  ],
  connections: [],
});

const createMultiBlockWorkflow = (): Workflow => ({
  id: 'multi-block-workflow',
  name: 'Multi Block Workflow',
  enabled: true,
  blocks: [
    {
      id: 'block-1',
      type: 'timer',
    },
    {
      id: 'block-2',
      type: 'logger',
    },
  ],
  connections: [],
});

const createConnectedWorkflow = (): Workflow => ({
  id: 'connected-workflow',
  name: 'Connected Workflow',
  enabled: true,
  blocks: [
    {
      id: 'block-a',
      type: 'timer',
    },
    {
      id: 'block-b',
      type: 'logger',
    },
  ],
  connections: [
    {
      from: 'block-a',
      fromPort: 'tick',
      to: 'block-b',
      toPort: 'input',
    },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('WorkflowExecutor - Lifecycle', () => {
  let executor: WorkflowExecutor;
  let emitHandler: ((instanceId: string, port: string, data: Json) => void) | null;
  let logHandler:
    | ((instanceId: string, workflowId: string, level: string, message: string) => void)
    | null;
  let startedBlocks: string[];

  beforeEach(() => {
    emitHandler = null;
    logHandler = null;
    startedBlocks = [];
    stub(PluginManager, {
      setBlockEmitHandler: (handler: (instanceId: string, port: string, data: Json) => void) => {
        emitHandler = handler;
      },
      setBlockLogHandler: (
        handler: (instanceId: string, workflowId: string, level: string, message: string) => void
      ) => {
        logHandler = handler;
      },
      clearBlockEmitHandler: () => {
        emitHandler = null;
      },
      clearBlockLogHandler: () => {
        logHandler = null;
      },
      startBlock: (
        _blockType: string,
        instanceId: string,
        _workflowId: string,
        _config: unknown
      ) => {
        startedBlocks.push(instanceId);
        return Promise.resolve({
          ok: true,
        });
      },
      stopBlockInstance: () => undefined,
      pushBlockInput: () => undefined,
    });

    stub(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
      }),
      list: () => [],
    });

    executor = new WorkflowExecutor();
  });

  afterEach(() => {
    if (executor.isRunning) {
      executor.stop();
    }
  });

  test('should start a workflow with multiple blocks successfully', async () => {
    expect.hasAssertions();
    const workflow = createMultiBlockWorkflow();

    await executor.start(workflow);

    expect(executor.isRunning).toBeTrue();
    expect(executor.workflowId).toBe('multi-block-workflow');
    expect(startedBlocks).toHaveLength(2);
    expect(startedBlocks).toContain('block-1');
    expect(startedBlocks).toContain('block-2');
  });

  test('should stop a running workflow and cleanup resources', async () => {
    expect.hasAssertions();
    const workflow = createSimpleWorkflow();

    await executor.start(workflow);
    expect(executor.isRunning).toBeTrue();

    executor.stop();

    expect(executor.isRunning).toBeFalse();
    expect(executor.workflowId).toBeNull();
    expect(emitHandler).toBeNull();
    expect(logHandler).toBeNull();
  });

  test('should replace existing workflow when starting a new one', async () => {
    expect.hasAssertions();
    const workflow1 = createSimpleWorkflow('workflow-1');
    const workflow2 = createSimpleWorkflow('workflow-2');

    await executor.start(workflow1);
    expect(executor.workflowId).toBe('workflow-1');

    await executor.start(workflow2);
    expect(executor.workflowId).toBe('workflow-2');
  });

  test('should handle workflow with no blocks gracefully', async () => {
    expect.hasAssertions();
    const workflow: Workflow = {
      id: 'empty-workflow',
      name: 'Empty Workflow',
      enabled: true,
      blocks: [],
      connections: [],
    };

    await executor.start(workflow);

    expect(executor.isRunning).toBeTrue();
    expect(startedBlocks).toHaveLength(0);
  });

  test('should report not running when no workflow is active', () => {
    expect(executor.isRunning).toBeFalse();
    expect(executor.workflowId).toBeNull();
  });

  test('should handle stop operation when no workflow is running', () => {
    expect(() => executor.stop()).not.toThrow();
    expect(executor.isRunning).toBeFalse();
  });
});

describe('WorkflowExecutor - Connection Map Building', () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    stub(PluginManager, {
      setBlockEmitHandler: () => undefined,
      setBlockLogHandler: () => undefined,
      clearBlockEmitHandler: () => undefined,
      clearBlockLogHandler: () => undefined,
      startBlock: () =>
        Promise.resolve({
          ok: true,
        }),
      stopBlockInstance: () => undefined,
      pushBlockInput: () => undefined,
    });

    stub(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
      }),
      list: () => [],
    });

    executor = new WorkflowExecutor();
  });

  afterEach(() => {
    if (executor.isRunning) {
      executor.stop();
    }
  });

  test('should build connection map for simple workflow', async () => {
    expect.hasAssertions();
    const workflow = createConnectedWorkflow();

    await executor.start(workflow);

    expect(executor.isRunning).toBeTrue();
  });

  test('should handle multiple connections from single output port', async () => {
    expect.hasAssertions();
    const workflow: Workflow = {
      id: 'multi-connection-workflow',
      name: 'Multi Connection Workflow',
      enabled: true,
      blocks: [
        {
          id: 'block-a',
          type: 'timer',
        },
        {
          id: 'block-b',
          type: 'logger',
        },
        {
          id: 'block-c',
          type: 'logger',
        },
      ],
      connections: [
        {
          from: 'block-a',
          fromPort: 'tick',
          to: 'block-b',
          toPort: 'input',
        },
        {
          from: 'block-a',
          fromPort: 'tick',
          to: 'block-c',
          toPort: 'input',
        },
      ],
    };

    await executor.start(workflow);

    expect(executor.isRunning).toBeTrue();
  });

  test('should handle connections with default port names', async () => {
    expect.hasAssertions();
    const workflow: Workflow = {
      id: 'default-port-workflow',
      name: 'Default Port Workflow',
      enabled: true,
      blocks: [
        {
          id: 'block-a',
          type: 'timer',
        },
        {
          id: 'block-b',
          type: 'logger',
        },
      ],
      connections: [
        {
          from: 'block-a',
          to: 'block-b',
        }, // No port names - should use defaults
      ],
    };

    await executor.start(workflow);

    expect(executor.isRunning).toBeTrue();
  });
});

describe('WorkflowExecutor - Data Injection', () => {
  let executor: WorkflowExecutor;
  let injectedData: Array<{
    blockId: string;
    port: string;
    data: Json;
  }>;

  beforeEach(() => {
    injectedData = [];

    stub(PluginManager, {
      setBlockEmitHandler: () => undefined,
      setBlockLogHandler: () => undefined,
      clearBlockEmitHandler: () => undefined,
      clearBlockLogHandler: () => undefined,
      startBlock: () =>
        Promise.resolve({
          ok: true,
        }),
      stopBlockInstance: () => undefined,
      pushBlockInput: (blockId: string, port: string, data: Json) => {
        injectedData.push({
          blockId,
          port,
          data,
        });
      },
    });

    stub(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
      }),
      list: () => [],
    });

    executor = new WorkflowExecutor();
  });

  afterEach(() => {
    if (executor.isRunning) {
      executor.stop();
    }
  });

  test('should successfully inject data into running block', async () => {
    expect.hasAssertions();
    const workflow = createSimpleWorkflow();

    await executor.start(workflow);
    const result = executor.inject('block-1', 'input', {
      value: 42,
    });

    expect(result).toBeTrue();
    expect(injectedData).toHaveLength(1);
    expect(injectedData[0]).toMatchObject({
      blockId: 'block-1',
      port: 'input',
      data: {
        value: 42,
      },
    });
  });

  test('should reject injection into non-existent block', async () => {
    expect.hasAssertions();
    const workflow = createSimpleWorkflow();

    await executor.start(workflow);
    const result = executor.inject('non-existent-block', 'input', {
      value: 42,
    });

    expect(result).toBeFalse();
    expect(injectedData).toHaveLength(0);
  });

  test('should reject injection when workflow is not running', () => {
    const result = executor.inject('block-1', 'input', {
      value: 42,
    });

    expect(result).toBeFalse();
    expect(injectedData).toHaveLength(0);
  });

  test.each([
    [
      'string value',
      'port1',
      'string',
    ],
    [
      'number value',
      'port2',
      123,
    ],
    [
      'boolean value',
      'port3',
      true,
    ],
    [
      'null value',
      'port4',
      null,
    ],
    [
      'nested object',
      'port5',
      {
        nested: {
          data: [
            1,
            2,
            3,
          ],
        },
      },
    ],
  ])('should inject %s successfully', async (_description, port, data) => {
    expect.hasAssertions();
    const workflow = createSimpleWorkflow();

    await executor.start(workflow);
    const result = executor.inject('block-1', port, data);

    expect(result).toBeTrue();
    expect(injectedData).toContainEqual({
      blockId: 'block-1',
      port,
      data,
    });
  });
});

describe('WorkflowExecutor - Event Listeners', () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    stub(PluginManager, {
      startBlock: () =>
        Promise.resolve({
          ok: true,
        }),
    });

    stub(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
      }),
      list: () => [],
    });

    executor = new WorkflowExecutor();
  });

  afterEach(() => {
    if (executor.isRunning) {
      executor.stop();
    }
  });

  test('should notify listeners when workflow starts', async () => {
    expect.hasAssertions();
    const events: ExecutionEvent[] = [];
    const listener: ExecutionListener = (event) => events.push(event);

    executor.addListener(listener);
    const workflow = createSimpleWorkflow();

    await executor.start(workflow);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe('workflow.started');
    expect(events[0]?.workflowId).toBe('test-workflow');
  });

  test('should notify listeners when workflow stops', async () => {
    expect.hasAssertions();
    const events: ExecutionEvent[] = [];
    const listener: ExecutionListener = (event) => events.push(event);

    const workflow = createSimpleWorkflow();
    await executor.start(workflow);

    executor.addListener(listener);
    executor.stop();

    const stopEvent = events.find((e) => e.type === 'workflow.stopped');
    expect(stopEvent).toBeDefined();
    expect(stopEvent?.workflowId).toBe('test-workflow');
  });

  test('should support multiple independent listeners', async () => {
    expect.hasAssertions();
    const events1: ExecutionEvent[] = [];
    const events2: ExecutionEvent[] = [];

    executor.addListener((e) => events1.push(e));
    executor.addListener((e) => events2.push(e));

    const workflow = createSimpleWorkflow();
    await executor.start(workflow);

    expect(events1.length).toBeGreaterThan(0);
    expect(events2.length).toBeGreaterThan(0);
    expect(events1).toHaveLength(events2.length);
  });

  test('should stop notifying after listener is removed', async () => {
    expect.hasAssertions();
    const events: ExecutionEvent[] = [];
    const listener: ExecutionListener = (event) => events.push(event);

    const unsubscribe = executor.addListener(listener);
    const workflow = createSimpleWorkflow();

    await executor.start(workflow);
    const countAfterStart = events.length;

    unsubscribe();
    executor.stop();
    await executor.start(workflow);

    // Should not receive new events after unsubscribe
    expect(events).toHaveLength(countAfterStart);
  });
});

describe('WorkflowExecutor - Block Emit and Data Flow', () => {
  let executor: WorkflowExecutor;
  let emitHandler: ((instanceId: string, port: string, data: Json) => void) | null;
  let logHandler:
    | ((instanceId: string, workflowId: string, level: string, message: string) => void)
    | null;
  let pushedInputs: Array<{
    blockId: string;
    port: string;
    data: Json;
  }>;

  beforeEach(() => {
    emitHandler = null;
    logHandler = null;
    pushedInputs = [];

    stub(PluginManager, {
      setBlockEmitHandler: (handler: (instanceId: string, port: string, data: Json) => void) => {
        emitHandler = handler;
      },
      setBlockLogHandler: (
        handler: (instanceId: string, workflowId: string, level: string, message: string) => void
      ) => {
        logHandler = handler;
      },
      clearBlockEmitHandler: () => {
        emitHandler = null;
      },
      clearBlockLogHandler: () => {
        logHandler = null;
      },
      startBlock: () =>
        Promise.resolve({
          ok: true,
        }),
      stopBlockInstance: () => undefined,
      pushBlockInput: (blockId: string, port: string, data: Json) => {
        pushedInputs.push({
          blockId,
          port,
          data,
        });
      },
    });

    stub(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
      }),
      list: () => [],
    });

    executor = new WorkflowExecutor();
  });

  afterEach(() => {
    if (executor.isRunning) {
      executor.stop();
    }
  });

  test('should emit block.emit event when block emits data', async () => {
    expect.hasAssertions();
    const events: ExecutionEvent[] = [];
    executor.addListener((e) => events.push(e));

    const workflow = createConnectedWorkflow();
    await executor.start(workflow);

    // Simulate block emitting data
    emitHandler?.('block-a', 'tick', {
      value: 42,
    });

    const emitEvent = events.find((e) => e.type === 'block.emit');
    expect(emitEvent).toBeDefined();
    expect(emitEvent?.blockId).toBe('block-a');
    expect(emitEvent?.port).toBe('tick');
    expect(emitEvent?.data).toEqual({
      value: 42,
    });
  });

  test('should dispatch data to connected blocks', async () => {
    expect.hasAssertions();
    const workflow = createConnectedWorkflow();
    await executor.start(workflow);

    // Simulate block-a emitting on 'tick' port
    emitHandler?.('block-a', 'tick', {
      message: 'hello',
    });

    // Should push to block-b's 'input' port
    expect(pushedInputs).toHaveLength(1);
    expect(pushedInputs[0]).toMatchObject({
      blockId: 'block-b',
      port: 'input',
      data: {
        message: 'hello',
      },
    });
  });

  test('should handle multiple connections from same output', async () => {
    expect.hasAssertions();
    const workflow: Workflow = {
      id: 'multi-conn',
      name: 'Multi Connection',
      enabled: true,
      blocks: [
        {
          id: 'source',
          type: 'timer',
        },
        {
          id: 'target-1',
          type: 'logger',
        },
        {
          id: 'target-2',
          type: 'logger',
        },
      ],
      connections: [
        {
          from: 'source',
          fromPort: 'out',
          to: 'target-1',
          toPort: 'in',
        },
        {
          from: 'source',
          fromPort: 'out',
          to: 'target-2',
          toPort: 'in',
        },
      ],
    };

    await executor.start(workflow);
    emitHandler?.('source', 'out', {
      data: 'test',
    });

    expect(pushedInputs).toHaveLength(2);
    expect(pushedInputs.map((p) => p.blockId)).toContain('target-1');
    expect(pushedInputs.map((p) => p.blockId)).toContain('target-2');
  });

  test('should emit block.log event when block logs', async () => {
    expect.hasAssertions();
    const events: ExecutionEvent[] = [];
    executor.addListener((e) => events.push(e));

    const workflow = createSimpleWorkflow();
    await executor.start(workflow);

    // Simulate block logging
    logHandler?.('block-1', 'test-workflow', 'info', 'Test log message');

    const logEvent = events.find((e) => e.type === 'block.log');
    expect(logEvent).toBeDefined();
    expect(logEvent?.blockId).toBe('block-1');
    expect(logEvent?.level).toBe('info');
    expect(logEvent?.message).toBe('Test log message');
  });

  test('should ignore log from different workflow', async () => {
    expect.hasAssertions();
    const events: ExecutionEvent[] = [];
    executor.addListener((e) => events.push(e));

    const workflow = createSimpleWorkflow();
    await executor.start(workflow);

    // Simulate log from different workflow
    logHandler?.('block-1', 'different-workflow', 'info', 'Should be ignored');

    const logEvent = events.find((e) => e.type === 'block.log');
    expect(logEvent).toBeUndefined();
  });

  test('should not emit when workflow not running', async () => {
    expect.hasAssertions();
    const events: ExecutionEvent[] = [];
    executor.addListener((e) => events.push(e));

    const workflow = createSimpleWorkflow();
    await executor.start(workflow);
    executor.stop();

    // Simulate emit after stop (should be ignored)
    emitHandler?.('block-1', 'out', {
      data: 'test',
    });

    const emitEvent = events.find((e) => e.type === 'block.emit');
    expect(emitEvent).toBeUndefined();
  });
});

describe('WorkflowExecutor - Block Start Error Handling', () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    stub(PluginManager, {
      setBlockEmitHandler: () => undefined,
      setBlockLogHandler: () => undefined,
      clearBlockEmitHandler: () => undefined,
      clearBlockLogHandler: () => undefined,
      startBlock: () =>
        Promise.resolve({
          ok: false,
          error: 'Block start failed',
        }),
      stopBlockInstance: () => undefined,
      pushBlockInput: () => undefined,
    });

    stub(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
      }),
      list: () => [],
    });

    executor = new WorkflowExecutor();
  });

  afterEach(() => {
    if (executor.isRunning) {
      executor.stop();
    }
  });

  test('should emit block.error event when block fails to start', async () => {
    expect.hasAssertions();
    const events: ExecutionEvent[] = [];
    executor.addListener((e) => events.push(e));

    const workflow = createSimpleWorkflow();
    await executor.start(workflow);

    const errorEvent = events.find((e) => e.type === 'block.error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.error).toBe('Block start failed');
  });

  test('should emit block.error event when startBlock throws', async () => {
    expect.hasAssertions();
    reset();

    stub(PluginManager, {
      setBlockEmitHandler: () => undefined,
      setBlockLogHandler: () => undefined,
      clearBlockEmitHandler: () => undefined,
      clearBlockLogHandler: () => undefined,
      startBlock: () => Promise.reject(new Error('Exception thrown')),
      stopBlockInstance: () => undefined,
      pushBlockInput: () => undefined,
    });

    stub(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
      }),
      list: () => [],
    });

    executor = new WorkflowExecutor();

    const events: ExecutionEvent[] = [];
    executor.addListener((e) => events.push(e));

    const workflow = createSimpleWorkflow();
    await executor.start(workflow);

    const errorEvent = events.find((e) => e.type === 'block.error');
    expect(errorEvent).toBeDefined();
  });
});

describe('WorkflowExecutor - Block Type Resolution', () => {
  let executor: WorkflowExecutor;
  let startedTypes: string[];

  beforeEach(() => {
    startedTypes = [];

    stub(PluginManager, {
      setBlockEmitHandler: () => undefined,
      setBlockLogHandler: () => undefined,
      clearBlockEmitHandler: () => undefined,
      clearBlockLogHandler: () => undefined,
      startBlock: (blockType: string) => {
        startedTypes.push(blockType);
        return Promise.resolve({
          ok: true,
        });
      },
      stopBlockInstance: () => undefined,
      pushBlockInput: () => undefined,
    });

    stub(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
      }),
      list: () => [
        {
          id: 'interval',
          type: '@brika/timer:interval',
          inputs: [],
          outputs: [],
          schema: {
            type: 'object',
          },
        },
        {
          id: 'request',
          type: '@brika/http:request',
          inputs: [],
          outputs: [],
          schema: {
            type: 'object',
          },
        },
      ],
    });

    executor = new WorkflowExecutor();
  });

  afterEach(() => {
    if (executor.isRunning) {
      executor.stop();
    }
  });

  test('should use full type name if contains colon', async () => {
    expect.hasAssertions();
    const workflow: Workflow = {
      id: 'test',
      name: 'Test',
      enabled: true,
      blocks: [
        {
          id: 'block-1',
          type: '@brika/timer:interval',
        },
      ],
      connections: [],
    };

    await executor.start(workflow);

    expect(startedTypes[0]).toBe('@brika/timer:interval');
  });

  test('should resolve short type name from block list', async () => {
    expect.hasAssertions();
    const workflow: Workflow = {
      id: 'test',
      name: 'Test',
      enabled: true,
      blocks: [
        {
          id: 'block-1',
          type: 'interval',
        },
      ],
      connections: [],
    };

    await executor.start(workflow);

    expect(startedTypes[0]).toBe('@brika/timer:interval');
  });

  test('should use original type if no match found', async () => {
    expect.hasAssertions();
    const workflow: Workflow = {
      id: 'test',
      name: 'Test',
      enabled: true,
      blocks: [
        {
          id: 'block-1',
          type: 'unknown-type',
        },
      ],
      connections: [],
    };

    await executor.start(workflow);

    expect(startedTypes[0]).toBe('unknown-type');
  });
});

describe('WorkflowExecutor - Complex Workflows', () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    stub(PluginManager, {
      setBlockEmitHandler: () => undefined,
      setBlockLogHandler: () => undefined,
      clearBlockEmitHandler: () => undefined,
      clearBlockLogHandler: () => undefined,
      startBlock: () =>
        Promise.resolve({
          ok: true,
        }),
      stopBlockInstance: () => undefined,
      pushBlockInput: () => undefined,
    });

    stub(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
      }),
      list: () => [],
    });

    executor = new WorkflowExecutor();
  });

  afterEach(() => {
    if (executor.isRunning) {
      executor.stop();
    }
  });

  test('should handle workflow with 50 blocks', async () => {
    expect.hasAssertions();
    const blocks = Array.from(
      {
        length: 50,
      },
      (_, i) => ({
        id: `block-${i}`,
        type: 'timer',
      })
    );

    const workflow: Workflow = {
      id: 'large-workflow',
      name: 'Large Workflow',
      enabled: true,
      blocks,
      connections: [],
    };

    await executor.start(workflow);

    expect(executor.isRunning).toBeTrue();
  });

  test('should handle complex multi-path connection graph', async () => {
    expect.hasAssertions();
    const workflow: Workflow = {
      id: 'complex-workflow',
      name: 'Complex Workflow',
      enabled: true,
      blocks: [
        {
          id: 'input',
          type: 'trigger',
        },
        {
          id: 'process-1',
          type: 'processor',
        },
        {
          id: 'process-2',
          type: 'processor',
        },
        {
          id: 'merge',
          type: 'merger',
        },
        {
          id: 'output',
          type: 'logger',
        },
      ],
      connections: [
        {
          from: 'input',
          fromPort: 'out',
          to: 'process-1',
          toPort: 'in',
        },
        {
          from: 'input',
          fromPort: 'out',
          to: 'process-2',
          toPort: 'in',
        },
        {
          from: 'process-1',
          fromPort: 'out',
          to: 'merge',
          toPort: 'in1',
        },
        {
          from: 'process-2',
          fromPort: 'out',
          to: 'merge',
          toPort: 'in2',
        },
        {
          from: 'merge',
          fromPort: 'out',
          to: 'output',
          toPort: 'in',
        },
      ],
    };

    await executor.start(workflow);

    expect(executor.isRunning).toBeTrue();
  });

  test('should handle workflow with block configurations', async () => {
    expect.hasAssertions();
    const workflow: Workflow = {
      id: 'configured-workflow',
      name: 'Configured Workflow',
      enabled: true,
      blocks: [
        {
          id: 'timer-1',
          type: 'timer',
          config: {
            interval: 1000,
            repeat: true,
          },
        },
        {
          id: 'logger-1',
          type: 'logger',
          config: {
            level: 'info',
            format: 'json',
          },
        },
      ],
      connections: [
        {
          from: 'timer-1',
          fromPort: 'tick',
          to: 'logger-1',
          toPort: 'input',
        },
      ],
    };

    await executor.start(workflow);

    expect(executor.isRunning).toBeTrue();
  });
});
