/**
 * Tests for Workspace Loader
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BlockTypeDefinition, Workflow } from '../types';
import { type BlockTypeRegistry, type LoaderEvents, WorkspaceLoader } from '../workspace/loader';

// Create a temporary directory for tests
const createTempDir = (): string => {
  const dir = join(tmpdir(), `workflow-loader-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

// Create a mock block type registry
const createMockRegistry = (): BlockTypeRegistry => ({
  get: (_type: string) => undefined, // No block types registered - validation will warn but not fail
});

// Create a valid workspace YAML
const createWorkspaceYaml = (id: string, name: string): string => `
workspace:
  id: ${id}
  name: ${name}
  enabled: true
blocks: []
`;

describe('WorkspaceLoader', () => {
  let tempDir: string;
  let registry: BlockTypeRegistry;

  beforeEach(() => {
    tempDir = createTempDir();
    registry = createMockRegistry();
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    test('creates loader with options', () => {
      const loader = new WorkspaceLoader({
        dir: tempDir,
        registry,
      });

      expect(loader).toBeDefined();
    });

    test('accepts custom poll interval', () => {
      const loader = new WorkspaceLoader({
        dir: tempDir,
        registry,
        pollInterval: 5000,
      });

      expect(loader).toBeDefined();
    });

    test('accepts event callbacks', () => {
      const events: LoaderEvents = {
        onLoad: () => undefined,
        onUnload: () => undefined,
        onError: () => undefined,
        onWarning: () => undefined,
      };

      const loader = new WorkspaceLoader({
        dir: tempDir,
        registry,
        events,
      });

      expect(loader).toBeDefined();
    });
  });

  describe('loadAll', () => {
    test('loads all YAML files from directory', async () => {
      // Create test files
      writeFileSync(join(tempDir, 'workflow1.yaml'), createWorkspaceYaml('wf1', 'Workflow 1'));
      writeFileSync(join(tempDir, 'workflow2.yml'), createWorkspaceYaml('wf2', 'Workflow 2'));

      const loader = new WorkspaceLoader({ dir: tempDir, registry });
      await loader.loadAll();

      const workflows = loader.list();
      expect(workflows).toHaveLength(2);
    });

    test('calls onLoad for each loaded workflow', async () => {
      writeFileSync(join(tempDir, 'test.yaml'), createWorkspaceYaml('test', 'Test'));

      const loadedPaths: string[] = [];
      const loader = new WorkspaceLoader({
        dir: tempDir,
        registry,
        events: {
          onLoad: (_workflow, filePath) => loadedPaths.push(filePath),
        },
      });

      await loader.loadAll();

      expect(loadedPaths).toHaveLength(1);
      expect(loadedPaths[0]).toContain('test.yaml');
    });

    test('calls onError for invalid YAML', async () => {
      writeFileSync(join(tempDir, 'invalid.yaml'), 'workspace:\n  invalid_yaml: [unclosed');

      const errors: string[] = [];
      const loader = new WorkspaceLoader({
        dir: tempDir,
        registry,
        events: {
          onError: (error) => errors.push(error),
        },
      });

      await loader.loadAll();

      expect(errors.length).toBeGreaterThan(0);
    });

    test('creates directory if it does not exist', async () => {
      const nonExistentDir = join(tempDir, 'new-dir');
      const loader = new WorkspaceLoader({
        dir: nonExistentDir,
        registry,
      });

      await loader.loadAll();
      // Should not throw
    });
  });

  describe('get', () => {
    test('returns workflow by ID', async () => {
      writeFileSync(join(tempDir, 'test.yaml'), createWorkspaceYaml('my-workflow', 'My Workflow'));

      const loader = new WorkspaceLoader({ dir: tempDir, registry });
      await loader.loadAll();

      const workflow = loader.get('my-workflow');
      expect(workflow).toBeDefined();
      expect(workflow?.workspace.id).toBe('my-workflow');
    });

    test('returns undefined for unknown ID', async () => {
      const loader = new WorkspaceLoader({ dir: tempDir, registry });
      await loader.loadAll();

      expect(loader.get('unknown')).toBeUndefined();
    });
  });

  describe('list', () => {
    test('returns empty array when no workflows loaded', async () => {
      const loader = new WorkspaceLoader({ dir: tempDir, registry });
      await loader.loadAll();

      expect(loader.list()).toEqual([]);
    });

    test('returns all loaded workflows', async () => {
      writeFileSync(join(tempDir, 'a.yaml'), createWorkspaceYaml('a', 'A'));
      writeFileSync(join(tempDir, 'b.yaml'), createWorkspaceYaml('b', 'B'));
      writeFileSync(join(tempDir, 'c.yaml'), createWorkspaceYaml('c', 'C'));

      const loader = new WorkspaceLoader({ dir: tempDir, registry });
      await loader.loadAll();

      expect(loader.list()).toHaveLength(3);
    });
  });

  describe('watch/stopWatching', () => {
    test('can start and stop watching', () => {
      const loader = new WorkspaceLoader({
        dir: tempDir,
        registry,
        pollInterval: 100,
      });

      loader.watch();
      // Should not throw

      loader.stopWatching();
      // Should not throw
    });

    test('watch is idempotent', () => {
      const loader = new WorkspaceLoader({
        dir: tempDir,
        registry,
        pollInterval: 100,
      });

      loader.watch();
      loader.watch(); // Second call should be no-op
      loader.stopWatching();
    });

    test('stopWatching is idempotent', () => {
      const loader = new WorkspaceLoader({
        dir: tempDir,
        registry,
        pollInterval: 100,
      });

      loader.stopWatching(); // Before watch
      loader.watch();
      loader.stopWatching();
      loader.stopWatching(); // After stop
    });
  });

  describe('save', () => {
    test('saves workflow to file', async () => {
      const loader = new WorkspaceLoader({ dir: tempDir, registry });
      await loader.loadAll();

      const workflow: Workflow = {
        version: '1.0',
        workspace: {
          id: 'new-workflow',
          name: 'New Workflow',
          enabled: true,
        },
        plugins: {},
        blocks: [],
      };

      await loader.save(workflow);

      const saved = loader.get('new-workflow');
      expect(saved).toBeDefined();
      expect(saved?.workspace.name).toBe('New Workflow');
    });

    test('calls onLoad after save', async () => {
      let loadedWorkflow: Workflow | null = null;
      const loader = new WorkspaceLoader({
        dir: tempDir,
        registry,
        events: {
          onLoad: (workflow) => {
            loadedWorkflow = workflow;
          },
        },
      });
      await loader.loadAll();

      const workflow: Workflow = {
        version: '1.0',
        workspace: {
          id: 'save-test',
          name: 'Save Test',
          enabled: true,
        },
        plugins: {},
        blocks: [],
      };

      await loader.save(workflow);

      expect(loadedWorkflow).not.toBeNull();
      expect((loadedWorkflow as Workflow | null)?.workspace.id).toBe('save-test');
    });
  });

  describe('delete', () => {
    test('deletes workflow file', async () => {
      writeFileSync(join(tempDir, 'to-delete.yaml'), createWorkspaceYaml('to-delete', 'To Delete'));

      const loader = new WorkspaceLoader({ dir: tempDir, registry });
      await loader.loadAll();

      expect(loader.get('to-delete')).toBeDefined();

      const result = await loader.delete('to-delete');

      expect(result).toBe(true);
      expect(loader.get('to-delete')).toBeUndefined();
    });

    test('returns false for unknown workflow', async () => {
      const loader = new WorkspaceLoader({ dir: tempDir, registry });
      await loader.loadAll();

      const result = await loader.delete('unknown');

      expect(result).toBe(false);
    });

    test('calls onUnload after delete', async () => {
      writeFileSync(join(tempDir, 'test.yaml'), createWorkspaceYaml('test', 'Test'));

      let unloadedId: string | null = null;
      const loader = new WorkspaceLoader({
        dir: tempDir,
        registry,
        events: {
          onUnload: (id) => {
            unloadedId = id;
          },
        },
      });

      await loader.loadAll();
      await loader.delete('test');

      expect(unloadedId as string | null).toBe('test');
    });
  });

  describe('validation', () => {
    test('calls onError for validation errors', async () => {
      // Create workflow with missing required field
      writeFileSync(
        join(tempDir, 'invalid.yaml'),
        `
workspace:
  name: Missing ID
blocks: []
`
      );

      const errors: string[] = [];
      const loader = new WorkspaceLoader({
        dir: tempDir,
        registry,
        events: {
          onError: (error) => errors.push(error),
        },
      });

      await loader.loadAll();

      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
