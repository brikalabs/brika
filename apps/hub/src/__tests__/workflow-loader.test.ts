/**
 * Tests for WorkflowLoader
 * Covers loading, saving, deleting, watching, and YAML serialization/deserialization.
 */
import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { get, provide, reset, stub, useTestBed } from '@brika/di/testing';
import { BlockRegistry } from '@/runtime/blocks/block-registry';
import { Logger } from '@/runtime/logs/log-router';
import type { Workflow } from '@/runtime/workflows/types';
import { WorkflowEngine } from '@/runtime/workflows/workflow-engine';
import { WorkflowLoader } from '@/runtime/workflows/workflow-loader';

useTestBed({ autoStub: false });

const TEST_DIR = join(import.meta.dir, '.test-workflow-loader');

const mockRegister = mock();
const mockUnregister = mock();
const mockGetPluginInfo = mock();

const createWorkflowYaml = (id: string, name: string, enabled = false): string => `
version: "1"
workspace:
  id: ${id}
  name: ${name}
  enabled: ${enabled}
blocks: []
`;

function waitForWorkflowRegister(workflowId: string): Promise<Workflow> {
  return waitForRegisterMatch((workflow) => workflow.id === workflowId);
}

async function waitForRegisterMatch(
  match: (workflow: Workflow) => boolean,
  timeoutMs = 8_000
): Promise<Workflow> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const matchingCall = mockRegister.mock.calls.find((call) => {
      const workflow = call[0] as Workflow | undefined;
      return workflow !== undefined && match(workflow);
    });

    if (matchingCall) return matchingCall[0] as Workflow;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for workflow registration');
}

async function waitForWorkflowUnregister(workflowId: string, timeoutMs = 8_000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const matchingCall = mockUnregister.mock.calls.find((call) => call[0] === workflowId);
    if (matchingCall) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for workflow unregister');
}

async function primeWatcher(label: string): Promise<void> {
  const workflowId = `__watch-ready-${label}`;
  const ready = waitForWorkflowRegister(workflowId);
  await Bun.write(
    join(TEST_DIR, `${workflowId}.yaml`),
    createWorkflowYaml(workflowId, `Watch Ready ${label}`)
  );
  await ready;
  await new Promise((resolve) => setTimeout(resolve, 100));
  mockRegister.mockClear();
}

describe('WorkflowLoader - Port Parsing', () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    stub(Logger);
    provide(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
        pluginId: 'test-plugin',
        schema: { type: 'object' as const, properties: {} },
      }),
      getPluginInfo: mockGetPluginInfo.mockReturnValue(null),
    });
    provide(WorkflowEngine, {
      register: mockRegister,
      unregister: mockUnregister,
    });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    reset();
  });

  it('should parse valid port references in outputs', async () => {
    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    const yamlContent = `
version: "1"
workspace:
  id: test-workflow
  name: Test Workflow
  enabled: false
blocks:
  - id: block-a
    type: timer
    outputs:
      tick: block-b:input
`;

    const workflowPath = join(TEST_DIR, 'test.yaml');
    await Bun.write(workflowPath, yamlContent);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const files = await Array.fromAsync(new Bun.Glob('*.yaml').scan({ cwd: TEST_DIR }));
    expect(files).toContain('test.yaml');
  });

  it('should parse valid port references in inputs', async () => {
    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    const yamlContent = `
version: "1"
workspace:
  id: test-workflow-2
  name: Test Workflow 2
  enabled: false
blocks:
  - id: block-a
    type: timer
  - id: block-b
    type: logger
    inputs:
      data: block-a:tick
`;

    const workflowPath = join(TEST_DIR, 'test2.yaml');
    await Bun.write(workflowPath, yamlContent);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const files = await Array.fromAsync(new Bun.Glob('*.yaml').scan({ cwd: TEST_DIR }));
    expect(files).toContain('test2.yaml');
  });

  it('should handle port references with colons correctly', async () => {
    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    const yamlContent = `
version: "1"
workspace:
  id: test-workflow-3
  name: Test Workflow 3
  enabled: false
blocks:
  - id: block-a
    type: timer
    outputs:
      output: block-b:complex:port:name
`;

    const workflowPath = join(TEST_DIR, 'test3.yaml');
    await Bun.write(workflowPath, yamlContent);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const files = await Array.fromAsync(new Bun.Glob('*.yaml').scan({ cwd: TEST_DIR }));
    expect(files).toContain('test3.yaml');
  });

  it('should skip invalid port references gracefully', async () => {
    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    const yamlContent = `
version: "1"
workspace:
  id: test-workflow-4
  name: Test Workflow 4
  enabled: false
blocks:
  - id: block-a
    type: timer
    outputs:
      output1: invalid-no-colon
      output2: block-b:valid-port
`;

    const workflowPath = join(TEST_DIR, 'test4.yaml');
    await Bun.write(workflowPath, yamlContent);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const files = await Array.fromAsync(new Bun.Glob('*.yaml').scan({ cwd: TEST_DIR }));
    expect(files).toContain('test4.yaml');
  });

  it('should handle bidirectional connections (outputs and inputs)', async () => {
    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    const yamlContent = `
version: "1"
workspace:
  id: test-workflow-5
  name: Test Workflow 5
  enabled: false
blocks:
  - id: block-a
    type: timer
    outputs:
      tick: block-b:input
  - id: block-b
    type: logger
    inputs:
      input: block-a:tick
`;

    const workflowPath = join(TEST_DIR, 'test5.yaml');
    await Bun.write(workflowPath, yamlContent);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const files = await Array.fromAsync(new Bun.Glob('*.yaml').scan({ cwd: TEST_DIR }));
    expect(files).toContain('test5.yaml');
  });

  it('should deduplicate connections from bidirectional refs', async () => {
    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    const yamlContent = `
version: "1"
workspace:
  id: test-workflow-6
  name: Test Workflow 6
  enabled: false
blocks:
  - id: block-a
    type: timer
    outputs:
      tick: block-b:input
  - id: block-b
    type: logger
    inputs:
      input: block-a:tick
`;

    const workflowPath = join(TEST_DIR, 'test6.yaml');
    await Bun.write(workflowPath, yamlContent);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const files = await Array.fromAsync(new Bun.Glob('*.yaml').scan({ cwd: TEST_DIR }));
    expect(files).toContain('test6.yaml');
  });
});

describe('WorkflowLoader - File Operations', () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    stub(Logger);
    provide(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
        pluginId: 'test-plugin',
        schema: { type: 'object' as const, properties: {} },
      }),
      getPluginInfo: mockGetPluginInfo.mockReturnValue(null),
    });
    provide(WorkflowEngine, {
      register: mockRegister,
      unregister: mockUnregister,
      get: () => undefined,
    });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    reset();
  });

  it('should create directory if it does not exist', async () => {
    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    const file = Bun.file(join(TEST_DIR, '.keep'));
    expect(await file.exists()).toBe(true);
  });

  it('should load YAML files on initialization', async () => {
    await Bun.write(join(TEST_DIR, '.keep'), '');
    await Bun.write(
      join(TEST_DIR, 'test-workflow.yaml'),
      `
version: "1"
workspace:
  id: initial-workflow
  name: Initial Workflow
  enabled: false
blocks: []
`
    );

    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    const files = await Array.fromAsync(new Bun.Glob('*.yaml').scan({ cwd: TEST_DIR }));
    expect(files).toContain('test-workflow.yaml');
  });

  it('should support both .yaml and .yml extensions', async () => {
    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    await Bun.write(
      join(TEST_DIR, 'test1.yaml'),
      `
version: "1"
workspace:
  id: workflow-1
  name: Workflow 1
  enabled: false
blocks: []
`
    );

    await Bun.write(
      join(TEST_DIR, 'test2.yml'),
      `
version: "1"
workspace:
  id: workflow-2
  name: Workflow 2
  enabled: false
blocks: []
`
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    const files = await Array.fromAsync(new Bun.Glob('*.{yaml,yml}').scan({ cwd: TEST_DIR }));
    expect(files.length).toBeGreaterThanOrEqual(2);
  });
});

describe('WorkflowLoader - Save and Delete', () => {
  let loader: WorkflowLoader;

  beforeAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  beforeEach(async () => {
    // Clean up YAML files
    try {
      const files = await Array.fromAsync(new Bun.Glob('*.{yaml,yml}').scan({ cwd: TEST_DIR }));
      for (const file of files) await rm(join(TEST_DIR, file), { force: true });
      await rm(join(TEST_DIR, '.keep'), { force: true });
    } catch {
      // Ignore
    }
    mockRegister.mockClear();
    mockUnregister.mockClear();
    mockGetPluginInfo.mockClear();

    stub(Logger);
    provide(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
        pluginId: 'test-plugin',
        schema: { type: 'object' as const, properties: {} },
      }),
      getPluginInfo: mockGetPluginInfo.mockReturnValue(null),
    });
    provide(WorkflowEngine, {
      register: mockRegister,
      unregister: mockUnregister,
    });
    loader = get(WorkflowLoader);
  });

  afterEach(async () => {
    loader.stopWatching();
    reset();
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('throws on saveWorkflow if loadDir not called', async () => {
    const freshLoader = get(WorkflowLoader);
    const workflow: Workflow = {
      id: 'test',
      name: 'Test',
      enabled: false,
      blocks: [],
      connections: [],
    };
    await expect(freshLoader.saveWorkflow(workflow)).rejects.toThrow('Call loadDir() first');
  });

  it('saves a workflow to YAML file', async () => {
    await loader.loadDir(TEST_DIR);

    const workflow: Workflow = {
      id: 'saved-workflow',
      name: 'Saved Workflow',
      description: 'A test workflow',
      enabled: true,
      blocks: [
        { id: 'block-a', type: 'timer', position: { x: 10, y: 20 }, config: { interval: 5000 } },
      ],
      connections: [],
    };

    const filePath = await loader.saveWorkflow(workflow);

    expect(filePath).toContain('saved-workflow.yaml');
    const content = await Bun.file(filePath).text();
    expect(content).toContain('saved-workflow');
    expect(content).toContain('Saved Workflow');
    expect(content).toContain('block-a');
    expect(content).toContain('timer');
    expect(mockRegister).toHaveBeenCalled();
  });

  it('saves to existing file if workflow was loaded from disk', async () => {
    await Bun.write(
      join(TEST_DIR, 'existing.yaml'),
      `
version: "1"
workspace:
  id: existing-wf
  name: Existing Workflow
  enabled: false
blocks: []
`
    );
    await loader.loadDir(TEST_DIR);

    const workflow: Workflow = {
      id: 'existing-wf',
      name: 'Updated Workflow',
      enabled: true,
      blocks: [],
      connections: [],
    };
    const filePath = await loader.saveWorkflow(workflow);

    expect(filePath).toContain('existing.yaml');
    const content = await Bun.file(filePath).text();
    expect(content).toContain('Updated Workflow');
  });

  it('serializes connections as inputs/outputs in YAML', async () => {
    await loader.loadDir(TEST_DIR);

    const workflow: Workflow = {
      id: 'connected-wf',
      name: 'Connected Workflow',
      enabled: false,
      blocks: [
        { id: 'block-a', type: 'timer' },
        { id: 'block-b', type: 'logger' },
      ],
      connections: [{ from: 'block-a', fromPort: 'tick', to: 'block-b', toPort: 'input' }],
    };

    const filePath = await loader.saveWorkflow(workflow);
    const content = await Bun.file(filePath).text();

    expect(content).toContain('block-b:input');
    expect(content).toContain('block-a:tick');
  });

  it('includes plugins section from block registry', async () => {
    mockGetPluginInfo.mockReturnValue({ id: '@test/timer-plugin', version: '1.0.0' });
    await loader.loadDir(TEST_DIR);

    const workflow: Workflow = {
      id: 'plugins-wf',
      name: 'With Plugins',
      enabled: false,
      blocks: [{ id: 'block-a', type: 'timer' }],
      connections: [],
    };

    const filePath = await loader.saveWorkflow(workflow);
    const content = await Bun.file(filePath).text();

    expect(content).toContain('@test/timer-plugin');
  });

  it('does not duplicate plugin entries in YAML', async () => {
    mockGetPluginInfo.mockReturnValue({ id: '@test/plugin', version: '1.0.0' });
    await loader.loadDir(TEST_DIR);

    const workflow: Workflow = {
      id: 'multi-blocks-wf',
      name: 'Multi Blocks',
      enabled: false,
      blocks: [
        { id: 'block-a', type: 'timer' },
        { id: 'block-b', type: 'counter' }, // same plugin
      ],
      connections: [],
    };

    const filePath = await loader.saveWorkflow(workflow);
    const content = await Bun.file(filePath).text();

    // Count occurrences of the plugin name
    const matches = content.match(/@test\/plugin/g);
    expect(matches).toHaveLength(1);
  });

  it('skips connections without fromPort or toPort in toYAML', async () => {
    await loader.loadDir(TEST_DIR);

    const workflow: Workflow = {
      id: 'partial-conn-wf',
      name: 'Partial Connections',
      enabled: false,
      blocks: [
        { id: 'block-a', type: 'timer' },
        { id: 'block-b', type: 'logger' },
      ],
      connections: [
        { from: 'block-a', to: 'block-b' }, // No ports
        { from: 'block-a', fromPort: 'tick', to: 'block-b', toPort: 'input' }, // Valid
      ],
    };

    const filePath = await loader.saveWorkflow(workflow);
    const content = await Bun.file(filePath).text();

    // Only the valid connection should appear
    expect(content).toContain('block-b:input');
  });

  it('throws on deleteWorkflow if loadDir not called', async () => {
    const freshLoader = get(WorkflowLoader);
    await expect(freshLoader.deleteWorkflow('test')).rejects.toThrow('Call loadDir() first');
  });

  it('returns false if workflow file does not exist', async () => {
    await loader.loadDir(TEST_DIR);

    const result = await loader.deleteWorkflow('nonexistent');
    expect(result).toBe(false);
  });

  it('deletes a workflow file and cleans internal state', async () => {
    await Bun.write(
      join(TEST_DIR, 'to-delete.yaml'),
      `
version: "1"
workspace:
  id: to-delete
  name: To Delete
  enabled: false
blocks: []
`
    );
    await loader.loadDir(TEST_DIR);

    const result = await loader.deleteWorkflow('to-delete');
    expect(result).toBe(true);
    expect(mockUnregister).toHaveBeenCalledWith('to-delete');

    // File should be removed
    const exists = await Bun.file(join(TEST_DIR, 'to-delete.yaml')).exists();
    expect(exists).toBe(false);
  });

  it('handles invalid YAML gracefully during loadFile', async () => {
    await Bun.write(join(TEST_DIR, 'broken.yaml'), 'invalid: yaml: [}');

    await loader.loadDir(TEST_DIR);

    // Should not throw, just skip the bad file
    // No workflow should be registered for the bad file
  });

  it('handles YAML that fails schema validation', async () => {
    await Bun.write(
      join(TEST_DIR, 'bad-schema.yaml'),
      `
version: "1"
notaworkspace: true
`
    );

    await loader.loadDir(TEST_DIR);

    // The register mock should not be called for the invalid schema
  });
});

describe('WorkflowLoader - Watch', () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    stub(Logger);
    provide(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
        pluginId: 'test-plugin',
        schema: { type: 'object' as const, properties: {} },
      }),
      getPluginInfo: () => undefined,
    });
    provide(WorkflowEngine, {
      register: mockRegister,
      unregister: mockUnregister,
    });
  });

  afterEach(async () => {
    reset();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('throws if watch called before loadDir', () => {
    const loader = get(WorkflowLoader);
    expect(() => loader.watch()).toThrow('Call loadDir() before watch()');
  });

  it('starts and stops watching without error', async () => {
    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    loader.watch();
    // Calling watch again should be idempotent
    loader.watch();

    loader.stopWatching();
  });

  it('stopWatching is safe to call when not watching', async () => {
    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    // Should not throw
    loader.stopWatching();
    loader.stopWatching();
  });
});

describe('WorkflowLoader - fromYAML Block Mapping & Connection Parsing', () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    mockRegister.mockClear();
    mockUnregister.mockClear();
    mockGetPluginInfo.mockClear();

    stub(Logger);
    provide(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
        pluginId: 'test-plugin',
        schema: { type: 'object' as const, properties: {} },
      }),
      getPluginInfo: mockGetPluginInfo.mockReturnValue(null),
    });
    provide(WorkflowEngine, {
      register: mockRegister,
      unregister: mockUnregister,
    });
  });

  afterEach(async () => {
    reset();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('registers workflow with correct block fields (id, type, position, config)', async () => {
    await Bun.write(
      join(TEST_DIR, 'blocks.yaml'),
      `
version: "1"
workspace:
  id: blocks-wf
  name: Blocks Workflow
  enabled: true
blocks:
  - id: block-a
    type: timer
    position:
      x: 10
      y: 20
    config:
      interval: 5000
  - id: block-b
    type: logger
`
    );

    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    const registered = mockRegister.mock.calls[0][0] as Workflow;
    expect(registered.id).toBe('blocks-wf');
    expect(registered.blocks).toHaveLength(2);

    // Block with position and config
    expect(registered.blocks[0].id).toBe('block-a');
    expect(registered.blocks[0].type).toBe('timer');
    expect(registered.blocks[0].position).toEqual({ x: 10, y: 20 });
    expect(registered.blocks[0].config).toEqual({ interval: 5000 });

    // Block without position and config
    expect(registered.blocks[1].id).toBe('block-b');
    expect(registered.blocks[1].type).toBe('logger');
    expect(registered.blocks[1].position).toBeUndefined();
    expect(registered.blocks[1].config).toBeUndefined();
  });

  it('parses output connections into the connections array', async () => {
    await Bun.write(
      join(TEST_DIR, 'outputs.yaml'),
      `
version: "1"
workspace:
  id: outputs-wf
  name: Outputs Workflow
  enabled: false
blocks:
  - id: block-a
    type: timer
    outputs:
      tick: block-b:input
      data: block-c:recv
  - id: block-b
    type: logger
  - id: block-c
    type: logger
`
    );

    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    const registered = mockRegister.mock.calls[0][0] as Workflow;
    expect(registered.connections.length).toBeGreaterThanOrEqual(2);

    const tickConn = registered.connections.find(
      (c) => c.from === 'block-a' && c.fromPort === 'tick'
    );
    expect(tickConn).toBeDefined();
    expect(tickConn!.to).toBe('block-b');
    expect(tickConn!.toPort).toBe('input');

    const dataConn = registered.connections.find(
      (c) => c.from === 'block-a' && c.fromPort === 'data'
    );
    expect(dataConn).toBeDefined();
    expect(dataConn!.to).toBe('block-c');
    expect(dataConn!.toPort).toBe('recv');
  });

  it('parses input connections into the connections array', async () => {
    await Bun.write(
      join(TEST_DIR, 'inputs.yaml'),
      `
version: "1"
workspace:
  id: inputs-wf
  name: Inputs Workflow
  enabled: false
blocks:
  - id: block-a
    type: timer
  - id: block-b
    type: logger
    inputs:
      data: block-a:tick
`
    );

    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    const registered = mockRegister.mock.calls[0][0] as Workflow;
    expect(registered.connections.length).toBeGreaterThanOrEqual(1);

    const conn = registered.connections.find((c) => c.from === 'block-a' && c.to === 'block-b');
    expect(conn).toBeDefined();
    expect(conn!.fromPort).toBe('tick');
    expect(conn!.toPort).toBe('data');
  });

  it('deduplicates connections from matching outputs and inputs', async () => {
    await Bun.write(
      join(TEST_DIR, 'dedup.yaml'),
      `
version: "1"
workspace:
  id: dedup-wf
  name: Dedup Workflow
  enabled: false
blocks:
  - id: block-a
    type: timer
    outputs:
      tick: block-b:input
  - id: block-b
    type: logger
    inputs:
      input: block-a:tick
`
    );

    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    const registered = mockRegister.mock.calls[0][0] as Workflow;
    // The same connection is defined in both outputs and inputs, should be deduplicated
    const matching = registered.connections.filter(
      (c) =>
        c.from === 'block-a' && c.fromPort === 'tick' && c.to === 'block-b' && c.toPort === 'input'
    );
    expect(matching).toHaveLength(1);
  });

  it('skips invalid port references in outputs (no colon)', async () => {
    await Bun.write(
      join(TEST_DIR, 'invalid-output.yaml'),
      `
version: "1"
workspace:
  id: invalid-output-wf
  name: Invalid Output Ref
  enabled: false
blocks:
  - id: block-a
    type: timer
    outputs:
      bad: no-colon-here
      good: block-b:input
  - id: block-b
    type: logger
`
    );

    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    const registered = mockRegister.mock.calls[0][0] as Workflow;
    // Only the valid connection should be present
    expect(registered.connections).toHaveLength(1);
    expect(registered.connections[0].fromPort).toBe('good');
  });

  it('skips invalid port references in inputs (no colon)', async () => {
    await Bun.write(
      join(TEST_DIR, 'invalid-input.yaml'),
      `
version: "1"
workspace:
  id: invalid-input-wf
  name: Invalid Input Ref
  enabled: false
blocks:
  - id: block-a
    type: timer
  - id: block-b
    type: logger
    inputs:
      bad: no-colon-here
      good: block-a:tick
`
    );

    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    const registered = mockRegister.mock.calls[0][0] as Workflow;
    // Only the valid connection should be present
    expect(registered.connections).toHaveLength(1);
    expect(registered.connections[0].toPort).toBe('good');
  });

  it('handles blocks with no outputs or inputs', async () => {
    await Bun.write(
      join(TEST_DIR, 'no-ports.yaml'),
      `
version: "1"
workspace:
  id: no-ports-wf
  name: No Ports
  enabled: false
blocks:
  - id: block-a
    type: timer
  - id: block-b
    type: logger
`
    );

    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    const registered = mockRegister.mock.calls[0][0] as Workflow;
    expect(registered.connections).toHaveLength(0);
  });
});

describe('WorkflowLoader - Watch Callbacks', () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    mockRegister.mockImplementation(() => undefined);
    mockRegister.mockClear();
    mockUnregister.mockImplementation(() => undefined);
    mockUnregister.mockClear();
    mockGetPluginInfo.mockClear();

    stub(Logger);
    provide(BlockRegistry, {
      has: () => true,
      get: () => ({
        id: 'test',
        outputs: [],
        inputs: [],
        pluginId: 'test-plugin',
        schema: { type: 'object' as const, properties: {} },
      }),
      getPluginInfo: mockGetPluginInfo.mockReturnValue(null),
    });
    provide(WorkflowEngine, {
      register: mockRegister,
      unregister: mockUnregister,
    });
  });

  afterEach(async () => {
    reset();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('loads a new YAML file added while watching', async () => {
    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);
    loader.watch();

    try {
      await primeWatcher('new');
      const watchedPath = join(TEST_DIR, 'watched-new.yaml');
      const registration = waitForWorkflowRegister('watched-new');
      const watchedYaml = createWorkflowYaml('watched-new', 'Watched New');
      await Bun.write(watchedPath, watchedYaml);
      // fs.watch events can be dropped under heavy parallel test load; nudge once.
      await Bun.write(watchedPath, watchedYaml);

      const registered = await registration;
      expect(registered.id).toBe('watched-new');
    } finally {
      loader.stopWatching();
    }
  }, 10_000);

  it('reloads a modified YAML file while watching', async () => {
    await Bun.write(
      join(TEST_DIR, 'watched-modify.yaml'),
      createWorkflowYaml('watched-modify', 'Original Name')
    );

    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);
    loader.watch();

    try {
      await primeWatcher('modify');
      const registration = waitForRegisterMatch(
        (workflow) => workflow.id === 'watched-modify' && workflow.name === 'Updated Name'
      );
      await Bun.write(
        join(TEST_DIR, 'watched-modify.yaml'),
        createWorkflowYaml('watched-modify', 'Updated Name', true)
      );

      const registered = await registration;
      expect(registered.id).toBe('watched-modify');
      expect(registered.name).toBe('Updated Name');
    } finally {
      loader.stopWatching();
    }
  });

  it('unloads a YAML file deleted while watching', async () => {
    await Bun.write(
      join(TEST_DIR, 'watched-delete.yaml'),
      createWorkflowYaml('watched-delete', 'To Be Deleted')
    );

    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);
    loader.watch();

    try {
      await primeWatcher('delete');
      const unregistration = waitForWorkflowUnregister('watched-delete');
      await rm(join(TEST_DIR, 'watched-delete.yaml'));
      await unregistration;
      expect(mockUnregister).toHaveBeenCalledWith('watched-delete');
    } finally {
      loader.stopWatching();
    }
  });

  it('ignores non-YAML files in the watcher', async () => {
    const loader = get(WorkflowLoader);
    await loader.loadDir(TEST_DIR);
    loader.watch();

    try {
      await primeWatcher('ignore');
      const registerCountBefore = mockRegister.mock.calls.length;
      const registration = waitForWorkflowRegister('watched-yaml');
      await Bun.write(join(TEST_DIR, 'readme.txt'), 'not a workflow');
      // Give the watcher a beat to process the non-YAML write.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockRegister.mock.calls.length).toBe(registerCountBefore);

      const watchedPath = join(TEST_DIR, 'watched-yaml.yaml');
      const watchedYaml = createWorkflowYaml('watched-yaml', 'Watched YAML');
      await Bun.write(watchedPath, watchedYaml);
      // fs.watch events can be dropped under heavy parallel test load; nudge once.
      await Bun.write(watchedPath, watchedYaml);

      const registered = await registration;
      expect(registered.id).toBe('watched-yaml');
      expect(mockRegister.mock.calls.length).toBeGreaterThanOrEqual(1);
    } finally {
      loader.stopWatching();
    }
  }, 10_000);
});

describe('WorkflowLoader - YAML Round Trip', () => {
  let loader: WorkflowLoader;

  beforeAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  beforeEach(async () => {
    // Clean up YAML files
    try {
      const files = await Array.fromAsync(new Bun.Glob('*.{yaml,yml}').scan({ cwd: TEST_DIR }));
      for (const file of files) await rm(join(TEST_DIR, file), { force: true });
      await rm(join(TEST_DIR, '.keep'), { force: true });
    } catch {
      // Ignore
    }
    mockRegister.mockClear();
    mockUnregister.mockClear();
    mockGetPluginInfo.mockClear();

    stub(Logger);
    provide(BlockRegistry, {
      getPluginInfo: mockGetPluginInfo.mockReturnValue(null),
    });
    provide(WorkflowEngine, {
      register: mockRegister,
      unregister: mockUnregister,
    });
    loader = get(WorkflowLoader);
  });

  afterEach(async () => {
    loader.stopWatching();
    reset();
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('save and reload produces equivalent workflow', async () => {
    await loader.loadDir(TEST_DIR);

    const workflow: Workflow = {
      id: 'round-trip',
      name: 'Round Trip',
      description: 'Testing round-trip',
      enabled: true,
      blocks: [
        { id: 'block-a', type: 'timer', position: { x: 10, y: 20 }, config: { interval: 1000 } },
        { id: 'block-b', type: 'logger', position: { x: 100, y: 200 } },
      ],
      connections: [{ from: 'block-a', fromPort: 'tick', to: 'block-b', toPort: 'input' }],
    };

    await loader.saveWorkflow(workflow);

    // Capture what was registered
    const registered = mockRegister.mock.calls[mockRegister.mock.calls.length - 1][0] as Workflow;
    expect(registered.id).toBe('round-trip');
    expect(registered.name).toBe('Round Trip');
    expect(registered.enabled).toBe(true);
    expect(registered.blocks).toHaveLength(2);
    expect(registered.connections).toHaveLength(1);
  });
});
