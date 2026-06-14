/**
 * Engine re-arm on plugin reload.
 *
 * A plugin unload tears down the process hosting a workflow's block
 * subscriptions. The engine must pause running workflows whose blocks
 * unregister and re-arm them when the blocks come back, otherwise a reload
 * leaves the workflow "running" with triggers subscribed to a dead process.
 */
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { get, reset, stub, useTestBed } from '@brika/di/testing';
import { BlockRegistry } from '@/runtime/blocks';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import type { Workflow } from '@/runtime/workflows/types';
import { WorkflowEngine } from '@/runtime/workflows/workflow-engine';

useTestBed({
  autoStub: false,
});

const PLUGIN = { id: 'p1', version: '1.0.0', name: 'p1' };
const BLOCK_TYPE = 'p1:trigger';

function makeWorkflow(): Workflow {
  return {
    id: 'wf-rearm',
    name: 'Rearm test',
    enabled: true,
    blocks: [{ id: 'b1', type: BLOCK_TYPE }],
    connections: [],
  };
}

describe('WorkflowEngine re-arm on plugin reload', () => {
  let registry: BlockRegistry;
  let engine: WorkflowEngine;

  beforeEach(() => {
    stub(PluginManager, {
      setBlockEmitHandler: () => undefined,
      addReapGuard: () => () => undefined,
      setBlockLogHandler: () => undefined,
      clearBlockEmitHandler: () => undefined,
      clearBlockLogHandler: () => undefined,
      startBlock: () => Promise.resolve(),
      stopBlockInstance: () => Promise.resolve(),
    });
    registry = get(BlockRegistry);
    engine = get(WorkflowEngine);
    engine.init();
    registry.register(
      { id: 'trigger', inputs: [], outputs: [], schema: { type: 'object' } },
      PLUGIN
    );
  });

  afterEach(() => {
    engine.unregister('wf-rearm');
    reset();
  });

  test('plugin unload pauses the running workflow; re-registration re-arms it', async () => {
    const workflow = makeWorkflow();
    engine.register(workflow);
    expect(workflow.status).toBe('running');

    // Plugin unloads: its blocks unregister, the workflow must pause.
    registry.unregisterPlugin(PLUGIN.id);
    expect(workflow.status).toBe('error');
    expect(workflow.error).toContain(BLOCK_TYPE);

    // Plugin comes back: the workflow re-arms automatically.
    registry.register(
      { id: 'trigger', inputs: [], outputs: [], schema: { type: 'object' } },
      PLUGIN
    );
    // Start is async behind the registration listener; yield the event loop.
    await Bun.sleep(10);
    expect(workflow.status).toBe('running');
  });

  test('a disabled idle workflow is left alone on plugin unload', () => {
    const workflow = makeWorkflow();
    workflow.enabled = false;
    engine.register(workflow);
    expect(workflow.status).toBe('stopped');

    registry.unregisterPlugin(PLUGIN.id);
    expect(workflow.status).toBe('stopped');
  });
});
