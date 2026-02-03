/**
 * Tests for WorkflowEngine
 * Testing workflow registration, lifecycle, state management, and execution
 */
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { get, provide, reset, stub, useTestBed } from '@brika/di/testing';
import type { BlockDefinition } from '@brika/sdk';
import { BlockRegistry } from '@/runtime/blocks/block-registry';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import { PluginEventHandler } from '@/runtime/plugins/plugin-events';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import type { Workflow } from '@/runtime/workflows/types';
import { WorkflowEngine } from '@/runtime/workflows/workflow-engine';
import type { ExecutionEvent } from '@/runtime/workflows/workflow-executor';

useTestBed({ autoStub: false });

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createWorkflow = (id: string, enabled = false): Workflow => ({
  id,
  name: `Workflow ${id}`,
  enabled,
  blocks: [{ id: 'block-1', type: 'timer' }],
  connections: [],
});

describe('WorkflowEngine - State Management', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    stub(Logger);
    provide(EventSystem, {
      dispatch: async <T>(action: T) => action,
      subscribeAll: () => () => undefined,
    });
    provide(BlockRegistry, {
      has: (type: string) => true,
      get: (type: string) => ({
        id: 'test',
        type,
        outputs: [],
        inputs: [],
        schema: { type: 'object' as const, properties: {} },
        pluginId: 'plugin',
      }),
      list: () => [],
      listByCategory: () => ({}),
      validateConnections: () => ({ valid: true }),
    });
    provide(PluginManager, {});
    provide(PluginEventHandler, {});

    engine = get(WorkflowEngine);
    engine.init();
  });

  test('should register workflow with stopped status', () => {
    const workflow: Workflow = {
      id: 'test-workflow',
      name: 'Test Workflow',
      enabled: false,
      blocks: [{ id: 'block-1', type: 'timer' }],
      connections: [],
    };

    engine.register(workflow);

    const registered = engine.get('test-workflow');
    expect(registered).toBeDefined();
    expect(registered?.status).toBe('stopped');
    expect(registered?.error).toBeUndefined();
    expect(registered?.startedAt).toBeUndefined();
  });

  test('should set error status when blocks are missing', () => {
    reset();
    stub(Logger);
    provide(EventSystem, {
      dispatch: async <T>(action: T) => action,
      subscribeAll: () => () => undefined,
    });
    provide(BlockRegistry, {
      has: (type: string) => type !== 'missing-block',
      get: () => undefined,
      list: () => [],
      listByCategory: () => ({}),
      validateConnections: () => ({ valid: true }),
    });
    provide(PluginManager, {});
    provide(PluginEventHandler, {});

    engine = get(WorkflowEngine);
    engine.init();

    const workflow: Workflow = {
      id: 'test-workflow-error',
      name: 'Test Workflow Error',
      enabled: false,
      blocks: [
        { id: 'block-1', type: 'timer' },
        { id: 'block-2', type: 'missing-block' },
      ],
      connections: [],
    };

    engine.register(workflow);

    const registered = engine.get('test-workflow-error');
    expect(registered?.status).toBe('error');
    expect(registered?.error).toContain('Missing blocks: missing-block');
  });

  test('should clear error status when re-registering valid workflow', () => {
    // First register with error
    reset();
    stub(Logger);
    provide(EventSystem, {
      dispatch: async <T>(action: T) => action,
      subscribeAll: () => () => undefined,
    });
    provide(BlockRegistry, {
      has: (type: string) => false, // All blocks missing
      get: () => undefined,
      list: () => [],
      listByCategory: () => ({}),
      validateConnections: () => ({ valid: true }),
    });
    provide(PluginManager, {});
    provide(PluginEventHandler, {});

    engine = get(WorkflowEngine);
    engine.init();

    const workflow: Workflow = {
      id: 'test-workflow-recovery',
      name: 'Test Workflow Recovery',
      enabled: false,
      blocks: [{ id: 'block-1', type: 'timer' }],
      connections: [],
    };

    engine.register(workflow);
    expect(engine.get('test-workflow-recovery')?.status).toBe('error');

    // Now re-register with blocks available
    reset();
    stub(Logger);
    provide(EventSystem, {
      dispatch: async <T>(action: T) => action,
      subscribeAll: () => () => undefined,
    });
    provide(BlockRegistry, {
      has: () => true, // All blocks available now
      get: () => ({
        id: 'test',
        type: 'plugin:test',
        outputs: [],
        inputs: [],
        schema: { type: 'object' as const, properties: {} },
        pluginId: 'plugin',
      }),
      list: () => [],
      listByCategory: () => ({}),
      validateConnections: () => ({ valid: true }),
    });
    provide(PluginManager, {});
    provide(PluginEventHandler, {});

    engine = get(WorkflowEngine);
    engine.init();
    engine.register(workflow);

    const registered = engine.get('test-workflow-recovery');
    expect(registered?.status).toBe('stopped');
    expect(registered?.error).toBeUndefined();
  });

  test('should list all registered workflows', () => {
    const workflow1: Workflow = {
      id: 'workflow-1',
      name: 'Workflow 1',
      enabled: false,
      blocks: [],
      connections: [],
    };

    const workflow2: Workflow = {
      id: 'workflow-2',
      name: 'Workflow 2',
      enabled: false,
      blocks: [],
      connections: [],
    };

    engine.register(workflow1);
    engine.register(workflow2);

    const workflows = engine.list();
    expect(workflows.length).toBe(2);
    expect(workflows.map((w) => w.id)).toContain('workflow-1');
    expect(workflows.map((w) => w.id)).toContain('workflow-2');
  });

  test('should unregister workflow', () => {
    const workflow: Workflow = {
      id: 'workflow-to-delete',
      name: 'Workflow to Delete',
      enabled: false,
      blocks: [],
      connections: [],
    };

    engine.register(workflow);
    expect(engine.get('workflow-to-delete')).toBeDefined();

    const result = engine.unregister('workflow-to-delete');
    expect(result).toBe(true);
    expect(engine.get('workflow-to-delete')).toBeUndefined();
  });

  test('should return false when unregistering non-existent workflow', () => {
    const result = engine.unregister('non-existent-workflow');
    expect(result).toBe(false);
  });

  test('should replace existing workflow on re-registration', () => {
    const workflow1: Workflow = {
      id: 'same-id',
      name: 'Original Name',
      enabled: false,
      blocks: [],
      connections: [],
    };

    engine.register(workflow1);
    expect(engine.get('same-id')?.name).toBe('Original Name');

    const workflow2: Workflow = {
      id: 'same-id',
      name: 'Updated Name',
      enabled: false,
      blocks: [],
      connections: [],
    };

    engine.register(workflow2);
    expect(engine.get('same-id')?.name).toBe('Updated Name');
  });
});

describe('WorkflowEngine - Block Registry Passthrough', () => {
  let engine: WorkflowEngine;
  let mockBlocks: BlockDefinition[];

  beforeEach(() => {
    mockBlocks = [
      {
        id: 'timer',
        type: 'plugin:timer',
        inputs: [],
        outputs: [],
        schema: { type: 'object' as const, properties: {} },
      },
      {
        id: 'logger',
        type: 'plugin:logger',
        inputs: [],
        outputs: [],
        schema: { type: 'object' as const, properties: {} },
      },
    ];

    stub(Logger);
    provide(EventSystem, {
      dispatch: async <T>(action: T) => action,
      subscribeAll: () => () => undefined,
    });
    provide(BlockRegistry, {
      has: () => true,
      list: () => mockBlocks,
      listByCategory: () => ({ input: [mockBlocks[0]!], output: [mockBlocks[1]!] }),
    });
    provide(PluginManager, {});
    provide(PluginEventHandler, {});

    engine = get(WorkflowEngine);
    engine.init();
  });

  test('should get all block types from registry', () => {
    const blocks = engine.getBlockTypes();

    expect(blocks).toHaveLength(2);
    expect(blocks).toEqual(mockBlocks);
  });

  test('should get blocks grouped by category', () => {
    const byCategory = engine.getBlocksByCategory();

    expect(byCategory).toHaveProperty('input');
    expect(byCategory).toHaveProperty('output');
    expect(byCategory.input).toHaveLength(1);
    expect(byCategory.output).toHaveLength(1);
  });
});

describe('WorkflowEngine - Execution Control', () => {
  let engine: WorkflowEngine;
  let mockPluginManager: Record<string, unknown>;

  beforeEach(() => {
    mockPluginManager = {
      setBlockEmitHandler: () => undefined,
      setBlockLogHandler: () => undefined,
      clearBlockEmitHandler: () => undefined,
      clearBlockLogHandler: () => undefined,
      startBlock: () => Promise.resolve({ ok: true }),
      stopBlockInstance: () => undefined,
      pushBlockInput: () => undefined,
    };

    stub(Logger);
    provide(EventSystem, {
      dispatch: async <T>(action: T) => action,
      subscribeAll: () => () => undefined,
    });
    provide(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        type: 'plugin:test',
        outputs: [],
        inputs: [],
        schema: { type: 'object' as const, properties: {} },
        pluginId: 'plugin',
      }),
      list: () => [],
      listByCategory: () => ({}),
    });
    provide(PluginManager, mockPluginManager);
    provide(PluginEventHandler, {});

    engine = get(WorkflowEngine);
    engine.init();
  });

  afterEach(() => {
    engine.stop();
  });

  test('should auto-start enabled workflow on registration', async () => {
    const workflow = createWorkflow('auto-start', true);

    engine.register(workflow);

    // Give async start time to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    const registered = engine.get('auto-start');
    expect(registered?.status).toBe('running');
    expect(registered?.startedAt).toBeDefined();
  });

  test('should not auto-start disabled workflow', async () => {
    const workflow = createWorkflow('no-auto-start', false);

    engine.register(workflow);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const registered = engine.get('no-auto-start');
    expect(registered?.status).toBe('stopped');
    expect(registered?.startedAt).toBeUndefined();
  });

  test('should check if workflow is running', async () => {
    const workflow = createWorkflow('running-check', true);

    engine.register(workflow);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(engine.isWorkflowRunning('running-check')).toBeTrue();
    expect(engine.isWorkflowRunning('non-existent')).toBeFalse();
  });

  test('should enable and start workflow', async () => {
    const workflow = createWorkflow('enable-test', false);
    engine.register(workflow);

    const result = await engine.setEnabled('enable-test', true);

    expect(result).toBeTrue();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const updated = engine.get('enable-test');
    expect(updated?.enabled).toBeTrue();
    expect(updated?.status).toBe('running');
  });

  test('should disable and stop workflow', async () => {
    const workflow = createWorkflow('disable-test', true);
    engine.register(workflow);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const result = await engine.setEnabled('disable-test', false);

    expect(result).toBeTrue();

    const updated = engine.get('disable-test');
    expect(updated?.enabled).toBeFalse();
    expect(updated?.status).toBe('stopped');
  });

  test('should return false when enabling non-existent workflow', async () => {
    const result = await engine.setEnabled('non-existent', true);
    expect(result).toBeFalse();
  });

  test('should not start workflow in error state', async () => {
    reset();
    stub(Logger);
    provide(EventSystem, {
      dispatch: async <T>(action: T) => action,
      subscribeAll: () => () => undefined,
    });
    provide(BlockRegistry, {
      has: () => false, // All blocks missing
      list: () => [],
      listByCategory: () => ({}),
    });
    provide(PluginManager, mockPluginManager);
    provide(PluginEventHandler, {});

    engine = get(WorkflowEngine);
    engine.init();

    const workflow = createWorkflow('error-workflow', true);
    engine.register(workflow);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const registered = engine.get('error-workflow');
    expect(registered?.status).toBe('error');
    expect(registered?.error).toContain('Missing blocks');
  });

  test('should set error status when blocks become unavailable on enable', async () => {
    reset();
    stub(Logger);
    provide(EventSystem, {
      dispatch: async <T>(action: T) => action,
      subscribeAll: () => () => undefined,
    });
    provide(BlockRegistry, {
      has: () => false, // Blocks missing
      list: () => [],
      listByCategory: () => ({}),
    });
    provide(PluginManager, mockPluginManager);
    provide(PluginEventHandler, {});

    engine = get(WorkflowEngine);
    engine.init();

    const workflow = createWorkflow('missing-blocks-enable', false);
    engine.register(workflow);

    const result = await engine.setEnabled('missing-blocks-enable', true);
    expect(result).toBeTrue();

    const updated = engine.get('missing-blocks-enable');
    expect(updated?.status).toBe('error');
    expect(updated?.error).toContain('Missing blocks');
  });
});

describe('WorkflowEngine - Global Listeners', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    stub(Logger);
    provide(EventSystem, {
      dispatch: async <T>(action: T) => action,
      subscribeAll: () => () => undefined,
    });
    provide(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        type: 'plugin:test',
        outputs: [],
        inputs: [],
        schema: { type: 'object' as const, properties: {} },
        pluginId: 'plugin',
      }),
      list: () => [],
      listByCategory: () => ({}),
    });
    provide(PluginManager, {
      setBlockEmitHandler: () => undefined,
      setBlockLogHandler: () => undefined,
      clearBlockEmitHandler: () => undefined,
      clearBlockLogHandler: () => undefined,
      startBlock: () => Promise.resolve({ ok: true }),
      stopBlockInstance: () => undefined,
    });
    provide(PluginEventHandler, {});

    engine = get(WorkflowEngine);
    engine.init();
  });

  afterEach(() => {
    engine.stop();
  });

  test('should notify global listeners on workflow events', async () => {
    const events: ExecutionEvent[] = [];
    const listener = (event: ExecutionEvent) => events.push(event);

    engine.addGlobalListener(listener);

    const workflow = createWorkflow('listener-test', true);
    engine.register(workflow);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(events.length).toBeGreaterThan(0);
    const startEvent = events.find((e) => e.type === 'workflow.started');
    expect(startEvent).toBeDefined();
    expect(startEvent?.workflowId).toBe('listener-test');
  });

  test('should support multiple global listeners', async () => {
    const events1: ExecutionEvent[] = [];
    const events2: ExecutionEvent[] = [];

    engine.addGlobalListener((e) => events1.push(e));
    engine.addGlobalListener((e) => events2.push(e));

    const workflow = createWorkflow('multi-listener', true);
    engine.register(workflow);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(events1.length).toBeGreaterThan(0);
    expect(events2.length).toBeGreaterThan(0);
    expect(events1.length).toBe(events2.length);
  });

  test('should stop notifying after listener is removed', async () => {
    const events: ExecutionEvent[] = [];
    const unsubscribe = engine.addGlobalListener((e) => events.push(e));

    const workflow1 = createWorkflow('listener-remove-1', true);
    engine.register(workflow1);

    await new Promise((resolve) => setTimeout(resolve, 100));
    const countAfterFirst = events.length;

    unsubscribe();

    const workflow2 = createWorkflow('listener-remove-2', true);
    engine.register(workflow2);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should not receive new events after unsubscribe
    expect(events.length).toBe(countAfterFirst);
  });
});

describe('WorkflowEngine - Lifecycle', () => {
  test('should stop all running workflows on engine stop', async () => {
    stub(Logger);
    provide(EventSystem, {
      dispatch: async <T>(action: T) => action,
      subscribeAll: () => () => undefined,
    });
    provide(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        type: 'plugin:test',
        outputs: [],
        inputs: [],
        schema: { type: 'object' as const, properties: {} },
        pluginId: 'plugin',
      }),
      list: () => [],
      listByCategory: () => ({}),
    });
    provide(PluginManager, {
      setBlockEmitHandler: () => undefined,
      setBlockLogHandler: () => undefined,
      clearBlockEmitHandler: () => undefined,
      clearBlockLogHandler: () => undefined,
      startBlock: () => Promise.resolve({ ok: true }),
      stopBlockInstance: () => undefined,
    });
    provide(PluginEventHandler, {});

    const engine = get(WorkflowEngine);
    engine.init();

    // Start multiple workflows
    const workflow1 = createWorkflow('stop-test-1', true);
    const workflow2 = createWorkflow('stop-test-2', true);

    engine.register(workflow1);
    engine.register(workflow2);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(engine.isWorkflowRunning('stop-test-1')).toBeTrue();
    expect(engine.isWorkflowRunning('stop-test-2')).toBeTrue();

    // Stop engine
    engine.stop();

    expect(engine.isWorkflowRunning('stop-test-1')).toBeFalse();
    expect(engine.isWorkflowRunning('stop-test-2')).toBeFalse();

    reset();
  });
});
