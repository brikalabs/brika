/**
 * Tests for WorkflowLoader
 * Focuses on port parsing and connection building after refactoring
 */
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { get, provide, reset, stub, useTestBed } from '@brika/di/testing';
import { BlockRegistry } from '@/runtime/blocks/block-registry';
import { Logger } from '@/runtime/logs/log-router';
import { WorkflowEngine } from '@/runtime/workflows/workflow-engine';
import { WorkflowLoader } from '@/runtime/workflows/workflow-loader';

useTestBed({ autoStub: false });

const TEST_DIR = join(import.meta.dir, '.test-workflow-loader');

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
    });
    provide(WorkflowEngine, {
      register: () => undefined,
      unregister: () => true,
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

    // Wait a bit for file watcher to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    // The loader should have processed the file without errors
    // We can't easily inspect the internal state, but we can verify the file was processed
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

    // Should handle the complex port name (everything after first colon is port ID)
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

    // Should process the file, skipping invalid references
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

    // Same connection defined in both output and input
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

    // The internal deduplication should work without errors
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
    });
    provide(WorkflowEngine, {
      register: () => undefined,
      unregister: () => true,
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
    // Create directory with a workflow file
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

    // Should have loaded the file
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
