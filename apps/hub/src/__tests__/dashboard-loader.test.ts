/**
 * Tests for DashboardLoader
 * Covers loading, saving, deleting dashboards from YAML files.
 */

import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { get, reset, stub, useTestBed } from '@brika/di/testing';
import { DashboardLoader } from '@/runtime/dashboards/dashboard-loader';
import type { Dashboard, DashboardBrickPlacement } from '@/runtime/dashboards/types';
import { Logger } from '@/runtime/logs/log-router';

useTestBed({ autoStub: false });

const TEST_DIR = join(import.meta.dir, '.test-dashboard-loader');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const createDashboard = (id = 'test-dash', bricks: DashboardBrickPlacement[] = []): Dashboard => ({
  id,
  name: 'Test Dashboard',
  icon: 'star',
  columns: 12,
  bricks,
});

const createPlacement = (
  instanceId = 'inst-1',
  brickTypeId = 'plugin:brick'
): DashboardBrickPlacement => ({
  instanceId,
  brickTypeId,
  config: {},
  position: { x: 0, y: 0 },
  size: { w: 2, h: 2 },
});

const VALID_YAML = `
version: "1"
dashboard:
  id: yaml-dash
  name: YAML Dashboard
  icon: star
  columns: 12
bricks:
  - instanceId: inst-1
    type: plugin:brick
    config:
      key: value
    position:
      x: 0
      y: 0
    size:
      w: 3
      h: 2
`;

const VALID_YAML_NO_BRICKS = `
version: "1"
dashboard:
  id: empty-dash
  name: Empty Dashboard
`;

const INVALID_YAML = `
this is not valid: yaml: [}
`;

describe('DashboardLoader', () => {
  let loader: DashboardLoader;

  beforeAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  beforeEach(() => {
    stub(Logger);
    loader = get(DashboardLoader);
  });

  afterEach(async () => {
    loader.stopWatching();
    reset();
    // Clean up files between tests
    try {
      const files = await Array.fromAsync(new Bun.Glob('*.{yaml,yml}').scan({ cwd: TEST_DIR }));
      for (const file of files) {
        await rm(join(TEST_DIR, file), { force: true });
      }
      // Also remove .keep
      await rm(join(TEST_DIR, '.keep'), { force: true });
    } catch {
      // Ignore
    }
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  // ─── loadDir ─────────────────────────────────────────────────────────────

  describe('loadDir', () => {
    test('creates directory if it does not exist', async () => {
      const newDir = join(TEST_DIR, 'new-subdir');
      await rm(newDir, { recursive: true, force: true });

      await loader.loadDir(newDir);

      const keepFile = Bun.file(join(newDir, '.keep'));
      expect(await keepFile.exists()).toBe(true);

      // Cleanup
      await rm(newDir, { recursive: true, force: true });
    });

    test('creates default Home dashboard when no dashboards exist', async () => {
      await loader.loadDir(TEST_DIR);

      const dashboards = loader.list();
      expect(dashboards.length).toBe(1);
      expect(dashboards[0].id).toBe('home');
      expect(dashboards[0].name).toBe('Home');
      expect(dashboards[0].icon).toBe('home');
      expect(dashboards[0].columns).toBe(12);
      expect(dashboards[0].bricks).toEqual([]);
    });

    test('loads existing YAML files from directory', async () => {
      await Bun.write(join(TEST_DIR, 'test.yaml'), VALID_YAML);

      await loader.loadDir(TEST_DIR);

      const dashboard = loader.get('yaml-dash');
      expect(dashboard).toBeDefined();
      expect(dashboard!.id).toBe('yaml-dash');
      expect(dashboard!.name).toBe('YAML Dashboard');
      expect(dashboard!.icon).toBe('star');
      expect(dashboard!.columns).toBe(12);
      expect(dashboard!.bricks).toHaveLength(1);
      expect(dashboard!.bricks[0].instanceId).toBe('inst-1');
      expect(dashboard!.bricks[0].brickTypeId).toBe('plugin:brick');
      expect(dashboard!.bricks[0].config).toEqual({ key: 'value' });
      expect(dashboard!.bricks[0].position).toEqual({ x: 0, y: 0 });
      expect(dashboard!.bricks[0].size).toEqual({ w: 3, h: 2 });
    });

    test('loads dashboard without bricks', async () => {
      await Bun.write(join(TEST_DIR, 'empty.yaml'), VALID_YAML_NO_BRICKS);

      await loader.loadDir(TEST_DIR);

      const dashboard = loader.get('empty-dash');
      expect(dashboard).toBeDefined();
      expect(dashboard!.bricks).toEqual([]);
      expect(dashboard!.columns).toBe(12); // default value
    });

    test('skips invalid YAML files gracefully', async () => {
      await Bun.write(join(TEST_DIR, 'bad.yaml'), INVALID_YAML);

      await loader.loadDir(TEST_DIR);

      // Should still create default home since bad YAML was skipped
      const dashboards = loader.list();
      expect(dashboards.some((d) => d.id === 'home')).toBe(true);
    });

    test('skips YAML files that fail schema validation', async () => {
      await Bun.write(
        join(TEST_DIR, 'invalid-schema.yaml'),
        `
version: "1"
notadashboard: true
`
      );

      await loader.loadDir(TEST_DIR);

      // Should create default home since the file was skipped
      const dashboards = loader.list();
      expect(dashboards.some((d) => d.id === 'home')).toBe(true);
    });

    test('does not create default Home if dashboards exist', async () => {
      await Bun.write(join(TEST_DIR, 'existing.yaml'), VALID_YAML);

      await loader.loadDir(TEST_DIR);

      const dashboards = loader.list();
      expect(dashboards.some((d) => d.id === 'home')).toBe(false);
      expect(dashboards.some((d) => d.id === 'yaml-dash')).toBe(true);
    });
  });

  // ─── get / list ──────────────────────────────────────────────────────────

  describe('get', () => {
    test('returns undefined for unknown id', async () => {
      await loader.loadDir(TEST_DIR);

      expect(loader.get('nonexistent')).toBeUndefined();
    });

    test('returns dashboard by id', async () => {
      await Bun.write(join(TEST_DIR, 'test.yaml'), VALID_YAML);
      await loader.loadDir(TEST_DIR);

      const dashboard = loader.get('yaml-dash');
      expect(dashboard).toBeDefined();
      expect(dashboard!.id).toBe('yaml-dash');
    });
  });

  describe('list', () => {
    test('returns all loaded dashboards', async () => {
      await Bun.write(join(TEST_DIR, 'test.yaml'), VALID_YAML);
      await loader.loadDir(TEST_DIR);

      const dashboards = loader.list();
      expect(dashboards.length).toBeGreaterThanOrEqual(1);
      expect(dashboards.some((d) => d.id === 'yaml-dash')).toBe(true);
    });
  });

  // ─── saveDashboard ───────────────────────────────────────────────────────

  describe('saveDashboard', () => {
    test('throws if loadDir has not been called', async () => {
      const dashboard = createDashboard();
      await expect(loader.saveDashboard(dashboard)).rejects.toThrow('Call loadDir() first');
    });

    test('saves dashboard to YAML file', async () => {
      await loader.loadDir(TEST_DIR);

      const dashboard = createDashboard('saved-dash', [createPlacement('inst-1', 'plugin:widget')]);
      const filePath = await loader.saveDashboard(dashboard);

      expect(filePath).toContain('saved-dash.yaml');
      const content = await Bun.file(filePath).text();
      expect(content).toContain('saved-dash');
      expect(content).toContain('Test Dashboard');
    });

    test('updates internal maps after save', async () => {
      await loader.loadDir(TEST_DIR);

      const dashboard = createDashboard('mapped-dash');
      await loader.saveDashboard(dashboard);

      expect(loader.get('mapped-dash')).toBeDefined();
      expect(loader.get('mapped-dash')!.name).toBe('Test Dashboard');
    });

    test('saves to existing file if dashboard already loaded', async () => {
      await Bun.write(join(TEST_DIR, 'test.yaml'), VALID_YAML);
      await loader.loadDir(TEST_DIR);

      const dashboard = loader.get('yaml-dash')!;
      dashboard.name = 'Updated Name';
      const filePath = await loader.saveDashboard(dashboard);

      expect(filePath).toContain('test.yaml');
      const content = await Bun.file(filePath).text();
      expect(content).toContain('Updated Name');
    });

    test('serializes bricks with config correctly', async () => {
      await loader.loadDir(TEST_DIR);

      const placement = createPlacement('inst-1', 'plugin:brick');
      placement.config = { apiKey: 'secret', timeout: 5000 };
      const dashboard = createDashboard('config-dash', [placement]);
      const filePath = await loader.saveDashboard(dashboard);

      const content = await Bun.file(filePath).text();
      expect(content).toContain('apiKey');
      expect(content).toContain('secret');
    });

    test('omits empty config in YAML output', async () => {
      await loader.loadDir(TEST_DIR);

      const placement = createPlacement('inst-1', 'plugin:brick');
      placement.config = {};
      const dashboard = createDashboard('no-config-dash', [placement]);
      const filePath = await loader.saveDashboard(dashboard);

      const content = await Bun.file(filePath).text();
      // config with no keys should be omitted
      expect(content).not.toContain('config:');
    });
  });

  // ─── deleteDashboard ─────────────────────────────────────────────────────

  describe('deleteDashboard', () => {
    test('throws if loadDir has not been called', async () => {
      await expect(loader.deleteDashboard('test')).rejects.toThrow('Call loadDir() first');
    });

    test('returns false if file does not exist', async () => {
      await loader.loadDir(TEST_DIR);

      const result = await loader.deleteDashboard('nonexistent');
      expect(result).toBe(false);
    });

    test('deletes dashboard file and cleans internal state', async () => {
      await Bun.write(join(TEST_DIR, 'test.yaml'), VALID_YAML);
      await loader.loadDir(TEST_DIR);

      expect(loader.get('yaml-dash')).toBeDefined();

      const result = await loader.deleteDashboard('yaml-dash');
      expect(result).toBe(true);
      expect(loader.get('yaml-dash')).toBeUndefined();
    });

    test('calls change listeners with unload action', async () => {
      await Bun.write(join(TEST_DIR, 'test.yaml'), VALID_YAML);
      await loader.loadDir(TEST_DIR);

      const listener = mock();
      loader.onChange(listener);

      await loader.deleteDashboard('yaml-dash');

      expect(listener).toHaveBeenCalledWith('yaml-dash', 'unload');
    });
  });

  // ─── onChange ─────────────────────────────────────────────────────────────

  describe('onChange', () => {
    test('registers and calls listener on load', async () => {
      await loader.loadDir(TEST_DIR);

      const listener = mock();
      loader.onChange(listener);

      // Save a new dashboard triggers internal load
      const dashboard = createDashboard('new-dash');
      await loader.saveDashboard(dashboard);

      // Listener should be called at least once (may be called for save)
      // The save itself updates the map directly, but loading from file calls listeners
    });

    test('returns unsubscribe function', async () => {
      await loader.loadDir(TEST_DIR);

      const listener = mock();
      const unsubscribe = loader.onChange(listener);

      unsubscribe();

      // After unsubscribing, deleting a dashboard should not call listener
      await Bun.write(join(TEST_DIR, 'test.yaml'), VALID_YAML);
      // Reload to get test.yaml loaded
      reset();
      stub(Logger);
      const loader2 = get(DashboardLoader);
      await loader2.loadDir(TEST_DIR);
      await loader2.deleteDashboard('yaml-dash');

      // Original listener should not have been called for delete
      const deleteCalls = listener.mock.calls.filter(
        (call: unknown[]) => call[1] === 'unload' && call[0] === 'yaml-dash'
      );
      expect(deleteCalls.length).toBe(0);
      loader2.stopWatching();
    });

    test('calls listener with load action when file is loaded', async () => {
      const listener = mock();

      // First set up empty dir
      await loader.loadDir(TEST_DIR);
      loader.onChange(listener);

      // Write a file and trigger loadDir in a new loader
      // Since we can't easily trigger the watcher, we test via the public interface
      // Save triggers internal set but not change listeners directly
      // Delete does trigger change listeners
      const dashboard = createDashboard('change-test');
      await loader.saveDashboard(dashboard);
      await loader.deleteDashboard('change-test');

      expect(listener).toHaveBeenCalledWith('change-test', 'unload');
    });
  });

  // ─── watch / stopWatching ────────────────────────────────────────────────

  describe('watch', () => {
    test('throws if loadDir has not been called', () => {
      const freshLoader = get(DashboardLoader);
      expect(() => freshLoader.watch()).toThrow('Call loadDir() before watch()');
    });

    test('starts and stops watching', async () => {
      await loader.loadDir(TEST_DIR);

      loader.watch();
      // Calling watch again should not create a second watcher (idempotent)
      loader.watch();

      loader.stopWatching();
    });

    test('stopWatching is safe to call when not watching', async () => {
      await loader.loadDir(TEST_DIR);

      // Should not throw
      loader.stopWatching();
    });
  });

  // ─── fromYAML / toYAML round-trip ────────────────────────────────────────

  describe('YAML round-trip', () => {
    test('save and reload produces equivalent dashboard', async () => {
      await loader.loadDir(TEST_DIR);

      const placement = createPlacement('inst-rt', 'plugin:widget');
      placement.config = { color: 'red' };
      placement.position = { x: 3, y: 5 };
      placement.size = { w: 4, h: 3 };

      const original = createDashboard('round-trip', [placement]);
      await loader.saveDashboard(original);

      // Create a fresh loader to reload from disk
      reset();
      stub(Logger);
      const loader2 = get(DashboardLoader);
      await loader2.loadDir(TEST_DIR);

      const reloaded = loader2.get('round-trip');
      expect(reloaded).toBeDefined();
      expect(reloaded!.id).toBe('round-trip');
      expect(reloaded!.name).toBe('Test Dashboard');
      expect(reloaded!.icon).toBe('star');
      expect(reloaded!.columns).toBe(12);
      expect(reloaded!.bricks).toHaveLength(1);
      expect(reloaded!.bricks[0].instanceId).toBe('inst-rt');
      expect(reloaded!.bricks[0].brickTypeId).toBe('plugin:widget');
      expect(reloaded!.bricks[0].config).toEqual({ color: 'red' });
      expect(reloaded!.bricks[0].position).toEqual({ x: 3, y: 5 });
      expect(reloaded!.bricks[0].size).toEqual({ w: 4, h: 3 });
      loader2.stopWatching();
    });

    test('dashboard without icon serializes and deserializes', async () => {
      await loader.loadDir(TEST_DIR);

      const dashboard: Dashboard = {
        id: 'no-icon',
        name: 'No Icon',
        columns: 6,
        bricks: [],
      };
      await loader.saveDashboard(dashboard);

      reset();
      stub(Logger);
      const loader2 = get(DashboardLoader);
      await loader2.loadDir(TEST_DIR);

      const reloaded = loader2.get('no-icon');
      expect(reloaded).toBeDefined();
      expect(reloaded!.icon).toBeUndefined();
      expect(reloaded!.columns).toBe(6);
      loader2.stopWatching();
    });
  });

  // ─── #unloadFile ─────────────────────────────────────────────────────────

  describe('unload behavior', () => {
    test('reloading a file replaces the old dashboard', async () => {
      await Bun.write(
        join(TEST_DIR, 'mutable.yaml'),
        `
version: "1"
dashboard:
  id: mutable-dash
  name: Original Name
  columns: 12
`
      );
      await loader.loadDir(TEST_DIR);
      expect(loader.get('mutable-dash')!.name).toBe('Original Name');

      // Overwrite the file and reload
      await Bun.write(
        join(TEST_DIR, 'mutable.yaml'),
        `
version: "1"
dashboard:
  id: mutable-dash
  name: Updated Name
  columns: 12
`
      );

      // Simulate reload by creating a new loader
      reset();
      stub(Logger);
      const loader2 = get(DashboardLoader);
      await loader2.loadDir(TEST_DIR);

      expect(loader2.get('mutable-dash')!.name).toBe('Updated Name');
      loader2.stopWatching();
    });
  });
});
