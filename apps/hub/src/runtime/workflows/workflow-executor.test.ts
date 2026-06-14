/**
 * Tests for WorkflowExecutor
 * Testing execution lifecycle, data flow, and event handling
 */
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { reset, stub, useTestBed } from '@brika/di/testing';
import { waitFor } from '@brika/testing';
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
  let emitHandler:
    | ((instanceId: string, port: string, data: Json, causationId?: string) => void)
    | null;
  let logHandler:
    | ((
        instanceId: string,
        workflowId: string,
        level: string,
        message: string,
        data?: Json
      ) => void)
    | null;
  let startedBlocks: string[];

  beforeEach(() => {
    emitHandler = null;
    logHandler = null;
    startedBlocks = [];
    stub(PluginManager, {
      addReapGuard: () => () => undefined,
      setBlockEmitHandler: (
        handler: (instanceId: string, port: string, data: Json, causationId?: string) => void
      ) => {
        emitHandler = handler;
      },
      setBlockLogHandler: (
        handler: (
          instanceId: string,
          workflowId: string,
          level: string,
          message: string,
          data?: Json
        ) => void
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
      resolve: (t: string) => t,
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
      addReapGuard: () => () => undefined,
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
      resolve: (t: string) => t,
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
      addReapGuard: () => () => undefined,
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
      resolve: (t: string) => t,
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
    ['string value', 'port1', 'string'],
    ['number value', 'port2', 123],
    ['boolean value', 'port3', true],
    ['null value', 'port4', null],
    [
      'nested object',
      'port5',
      {
        nested: {
          data: [1, 2, 3],
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
      addReapGuard: () => () => undefined,
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
      resolve: (t: string) => t,
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
  let emitHandler:
    | ((instanceId: string, port: string, data: Json, causationId?: string) => void)
    | null;
  let logHandler:
    | ((
        instanceId: string,
        workflowId: string,
        level: string,
        message: string,
        data?: Json
      ) => void)
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
      addReapGuard: () => () => undefined,
      setBlockEmitHandler: (
        handler: (instanceId: string, port: string, data: Json, causationId?: string) => void
      ) => {
        emitHandler = handler;
      },
      setBlockLogHandler: (
        handler: (
          instanceId: string,
          workflowId: string,
          level: string,
          message: string,
          data?: Json
        ) => void
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
      resolve: (t: string) => t,
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

  test('inject with replay re-delivers the last value that flowed into the port', async () => {
    expect.hasAssertions();
    await executor.start(createConnectedWorkflow());

    // block-a emitted once: its buffer holds the last value block-b received.
    emitHandler?.('block-a', 'tick', { message: 'previous-input' });
    pushedInputs.length = 0;

    const ok = executor.inject('block-b', 'input', {}, { replay: true });

    expect(ok).toBeTrue();
    expect(pushedInputs).toHaveLength(1);
    expect(pushedInputs[0]).toMatchObject({
      blockId: 'block-b',
      port: 'input',
      data: { message: 'previous-input' },
    });
  });

  test('inject with replay falls back to the payload when nothing has flowed yet', async () => {
    expect.hasAssertions();
    await executor.start(createConnectedWorkflow());

    const ok = executor.inject('block-b', 'input', {}, { replay: true });

    expect(ok).toBeTrue();
    expect(pushedInputs).toHaveLength(1);
    expect(pushedInputs[0]).toMatchObject({ blockId: 'block-b', port: 'input', data: {} });
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

  test('should open a run and stamp a shared correlationId across the cascade', async () => {
    expect.hasAssertions();
    const events: ExecutionEvent[] = [];
    executor.addListener((e) => events.push(e));

    await executor.start(createConnectedWorkflow());

    // block-a is a source (no inbound connection) -> opens a fresh run.
    emitHandler?.('block-a', 'tick', { value: 1 });

    const opened = events.find((e) => e.type === 'run.opened');
    const emit = events.find((e) => e.type === 'block.emit' && e.blockId === 'block-a');
    const start = events.find((e) => e.type === 'block.start' && e.blockId === 'block-b');

    expect(opened?.correlationId).toBeDefined();
    expect(opened?.blockId).toBe('block-a');
    const cid = opened?.correlationId;
    expect(emit?.correlationId).toBe(cid);
    expect(start?.correlationId).toBe(cid);
    expect(start?.port).toBe('input');
  });

  test('should reuse the upstream run when a downstream block emits', async () => {
    expect.hasAssertions();
    const events: ExecutionEvent[] = [];
    executor.addListener((e) => events.push(e));

    await executor.start(createConnectedWorkflow());

    emitHandler?.('block-a', 'tick', { value: 1 });
    const cid = events.find((e) => e.type === 'run.opened')?.correlationId;

    // block-b (downstream) emits -> it inherits block-a's run, no new run opens.
    emitHandler?.('block-b', 'out', { value: 2 });

    const downstreamEmit = events.find((e) => e.type === 'block.emit' && e.blockId === 'block-b');
    expect(downstreamEmit?.correlationId).toBe(cid);
    expect(events.filter((e) => e.type === 'run.opened')).toHaveLength(1);
  });

  test('an emit carrying a causationId is attributed to that exact run (fan-in safe)', async () => {
    expect.hasAssertions();
    const events: ExecutionEvent[] = [];
    executor.addListener((e) => events.push(e));

    await executor.start(createConnectedWorkflow());

    // Two source emissions open two distinct runs.
    emitHandler?.('block-a', 'tick', { value: 1 });
    emitHandler?.('block-a', 'tick', { value: 2 });
    const opened = events.filter((e) => e.type === 'run.opened');
    expect(opened).toHaveLength(2);
    const firstRun = opened[0]?.correlationId;
    const secondRun = opened[1]?.correlationId;
    expect(firstRun).toBeDefined();
    expect(firstRun).not.toBe(secondRun);

    // block-b answers for the FIRST input even though the second arrived since:
    // the SDK-traced causationId wins over the last-input heuristic.
    if (firstRun) {
      emitHandler?.('block-b', 'out', { value: 10 }, firstRun);
    }

    const downstreamEmit = events.find((e) => e.type === 'block.emit' && e.blockId === 'block-b');
    expect(downstreamEmit?.correlationId).toBe(firstRun);
    expect(events.filter((e) => e.type === 'run.opened')).toHaveLength(2);
  });

  test('should close open runs on stop', async () => {
    expect.hasAssertions();
    const events: ExecutionEvent[] = [];
    executor.addListener((e) => events.push(e));

    await executor.start(createConnectedWorkflow());
    emitHandler?.('block-a', 'tick', { value: 1 });
    const cid = events.find((e) => e.type === 'run.opened')?.correlationId;

    executor.stop();

    const closed = events.find((e) => e.type === 'run.closed');
    expect(closed?.correlationId).toBe(cid);
  });
});

describe('WorkflowExecutor - Block Start Error Handling', () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    stub(PluginManager, {
      addReapGuard: () => () => undefined,
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
      resolve: (t: string) => t,
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
      addReapGuard: () => () => undefined,
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
      resolve: (t: string) => t,
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
      addReapGuard: () => () => undefined,
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

    const shortNames: Record<string, string> = {
      interval: '@brika/timer:interval',
      request: '@brika/http:request',
    };

    stub(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
      }),
      resolve: (type: string) => {
        if (type.includes(':')) {
          return type;
        }
        return shortNames[type] ?? type;
      },
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
      blocks: [{ id: 'block-1', type: '@brika/timer:interval' }],
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
      blocks: [{ id: 'block-1', type: 'interval' }],
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
      blocks: [{ id: 'block-1', type: 'unknown-type' }],
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
      addReapGuard: () => () => undefined,
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
      resolve: (t: string) => t,
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

describe('WorkflowExecutor - Hosted triggers', () => {
  let executor: WorkflowExecutor;
  let startedBlocks: string[];
  let pushed: Array<{ instanceId: string; port: string; data: Json }>;
  let reapGuard: ((name: string) => boolean) | null;

  // A trigger-block type whose registry def carries a `trigger` descriptor, and
  // a normal downstream block. `clock` is provided by `trigger-plugin`, `logger`
  // by `normal-plugin`.
  const defFor = (type: string) => {
    if (type === 'clock') {
      return {
        id: 'clock',
        type,
        inputs: [],
        outputs: [{ id: 'tick', name: 'Tick' }],
        schema: {},
        pluginId: 'trigger-plugin',
        trigger: { kind: 'interval' as const, intervalField: 'interval', output: 'tick' },
      };
    }
    return {
      id: type,
      type,
      inputs: [{ id: 'input', name: 'In' }],
      outputs: [],
      schema: {},
      pluginId: 'normal-plugin',
    };
  };

  beforeEach(() => {
    startedBlocks = [];
    pushed = [];
    reapGuard = null;
    stub(PluginManager, {
      addReapGuard: (g: (name: string) => boolean) => {
        reapGuard = g;
        return () => {
          reapGuard = null;
        };
      },
      setBlockEmitHandler: () => undefined,
      setBlockLogHandler: () => undefined,
      clearBlockEmitHandler: () => undefined,
      clearBlockLogHandler: () => undefined,
      startBlock: (_t: string, instanceId: string) => {
        startedBlocks.push(instanceId);
        return Promise.resolve({ ok: true });
      },
      stopBlockInstance: () => undefined,
      pushBlockInput: (instanceId: string, port: string, data: Json) => {
        pushed.push({ instanceId, port, data });
      },
    });
    stub(BlockRegistry, {
      has: () => true,
      get: (type: string) => defFor(type),
      resolve: (t: string) => t,
      getProvider: (type: string) => defFor(type).pluginId,
    });
    executor = new WorkflowExecutor();
  });

  afterEach(() => {
    if (executor.isRunning) {
      executor.stop();
    }
  });

  const clockWorkflow = (intervalMs: number): Workflow => ({
    id: 'wf-trigger',
    name: 'Trigger WF',
    enabled: true,
    blocks: [
      { id: 'c1', type: 'clock', config: { interval: intervalMs } },
      { id: 'l1', type: 'logger' },
    ],
    connections: [{ from: 'c1', fromPort: 'tick', to: 'l1', toPort: 'input' }],
  });

  test('schedules the trigger in the hub, does not start it in the plugin', async () => {
    await executor.start(clockWorkflow(999_999));
    // The clock is hub-owned: never started in the plugin, but is a run root.
    expect(startedBlocks).not.toContain('c1');
    expect(startedBlocks).toContain('l1');
    expect(executor.ownsBlock('c1')).toBeTrue();
  });

  test('does not pin a trigger-only plugin (its provider stays reapable)', async () => {
    await executor.start(clockWorkflow(999_999));
    expect(reapGuard).not.toBeNull();
    // The trigger provider is NOT pinned; the downstream provider IS.
    expect(reapGuard?.('trigger-plugin')).toBeFalse();
    expect(reapGuard?.('normal-plugin')).toBeTrue();
  });

  test('fires on its interval and dispatches a { count, ts } tick downstream', async () => {
    await executor.start(clockWorkflow(25));
    await waitFor(() => pushed.length >= 2, { timeoutMs: 2000 });
    expect(pushed[0]?.instanceId).toBe('l1');
    expect(pushed[0]?.port).toBe('input');
    expect((pushed[0]?.data as { count: number }).count).toBe(1);
    expect((pushed[1]?.data as { count: number }).count).toBe(2);
  });

  test('does not schedule when the interval config is missing or invalid', async () => {
    const events: ExecutionEvent[] = [];
    executor.addListener((e) => events.push(e));
    await executor.start({
      id: 'wf-bad',
      name: 'bad',
      enabled: true,
      blocks: [{ id: 'c1', type: 'clock', config: {} }],
      connections: [],
    });
    expect(events.some((e) => e.type === 'block.error' && e.blockId === 'c1')).toBeTrue();
  });
});
