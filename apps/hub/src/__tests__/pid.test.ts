/**
 * Tests for the PID bootstrap plugin
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pid } from '@/runtime/bootstrap/plugins/pid';

function getLifecycleHook(
  plugin: ReturnType<typeof pid>,
  hook: 'onInit' | 'onStart' | 'onStop'
): () => Promise<void> | void {
  const lifecycleHook = plugin[hook];
  if (!lifecycleHook) {
    throw new Error(`pid plugin must implement ${hook}`);
  }
  return lifecycleHook;
}

describe('pid plugin', () => {
  let tmpDir: string;
  let brikaDir: string;
  let pidFile: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'brika-pid-'));
    brikaDir = join(tmpDir, '.brika');
    pidFile = join(brikaDir, 'brika.pid');
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ─── onStart ───────────────────────────────────────────────────────────────

  describe('onStart', () => {
    test('writes current PID to the pid file', async () => {
      await mkdir(brikaDir, { recursive: true });
      const plugin = pid();
      await getLifecycleHook(plugin, 'onStart')();

      const content = await readFile(pidFile, 'utf8');
      expect(content).toBe(String(process.pid));
    });
  });

  // ─── onStop ────────────────────────────────────────────────────────────────

  describe('onStop', () => {
    test('removes the pid file', async () => {
      await mkdir(brikaDir, { recursive: true });
      await writeFile(pidFile, String(process.pid));

      const plugin = pid();
      await getLifecycleHook(plugin, 'onStop')();

      const exists = await Bun.file(pidFile).exists();
      expect(exists).toBe(false);
    });

    test('does not remove pid file if it belongs to another process', async () => {
      await mkdir(brikaDir, { recursive: true });
      await writeFile(pidFile, '999999999');

      const plugin = pid();
      await getLifecycleHook(plugin, 'onStop')();

      const content = await readFile(pidFile, 'utf8');
      expect(content).toBe('999999999');
    });

    test('does not throw when pid file is already gone', async () => {
      const plugin = pid();
      await expect(getLifecycleHook(plugin, 'onStop')()).resolves.toBeUndefined();
    });

    test('consecutive start: failed instance does not wipe running instance PID', async () => {
      await mkdir(brikaDir, { recursive: true });
      // PID 1 (init/launchd) is always alive — simulates a running first instance
      await writeFile(pidFile, '1');

      const plugin = pid();

      // Second instance detects the conflict
      await expect(getLifecycleHook(plugin, 'onInit')()).rejects.toThrow('already running');

      // Second instance's onStop must leave the first instance's PID intact
      await getLifecycleHook(plugin, 'onStop')();

      const content = await readFile(pidFile, 'utf8');
      expect(content).toBe('1');
    });
  });

  // ─── onInit ────────────────────────────────────────────────────────────────

  describe('onInit', () => {
    test('passes when no pid file exists', async () => {
      const plugin = pid();
      await expect(getLifecycleHook(plugin, 'onInit')()).resolves.toBeUndefined();
    });

    test('cleans up a stale pid file (process gone)', async () => {
      await mkdir(brikaDir, { recursive: true });
      // Use a PID that is very unlikely to exist
      await writeFile(pidFile, '2147483647');

      const plugin = pid();
      await expect(getLifecycleHook(plugin, 'onInit')()).resolves.toBeUndefined();

      const exists = await Bun.file(pidFile).exists();
      expect(exists).toBe(false);
    });

    test('throws when another instance is running (own PID)', async () => {
      await mkdir(brikaDir, { recursive: true });
      // Use current process PID — it's definitely alive
      await writeFile(pidFile, String(process.pid));

      const plugin = pid();
      await expect(getLifecycleHook(plugin, 'onInit')()).rejects.toThrow('already running');
    });

    test('error message includes the existing PID', async () => {
      await mkdir(brikaDir, { recursive: true });
      await writeFile(pidFile, String(process.pid));

      const plugin = pid();
      await expect(getLifecycleHook(plugin, 'onInit')()).rejects.toThrow(String(process.pid));
    });
  });
});
