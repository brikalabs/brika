/**
 * Tests for PluginWatcher
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import { Logger } from '@/runtime/logs/log-router';
import { PluginWatcher } from '@/runtime/plugins/plugin-watcher';

useTestBed();

describe('PluginWatcher', () => {
  let watcher: PluginWatcher;
  let reloadHandler: ReturnType<typeof mock>;

  beforeEach(() => {
    stub(Logger);
    watcher = get(PluginWatcher);
    reloadHandler = mock();
    watcher.setReloadHandler(reloadHandler);
  });

  afterEach(() => {
    watcher.stopAll();
  });

  test('watch() starts watching a plugin directory', () => {
    // Use the hub's own src/ directory as a known-to-exist directory
    const hubDir = `${import.meta.dir}/..`;

    // Should not throw
    watcher.watch('@test/plugin', hubDir);
  });

  test('watch() is idempotent — re-watching the same plugin unwatches first', () => {
    const hubDir = `${import.meta.dir}/..`;

    watcher.watch('@test/plugin', hubDir);
    watcher.watch('@test/plugin', hubDir);

    // No error, watcher replaced
  });

  test('watch() handles missing src/ directory gracefully', () => {
    // This path has no src/ subdirectory
    watcher.watch('@test/no-src', '/tmp/nonexistent-dir-for-brika-test');

    // Should not throw — just logs and skips
  });

  test('unwatch() stops watching a plugin', () => {
    const hubDir = `${import.meta.dir}/..`;

    watcher.watch('@test/plugin', hubDir);
    watcher.unwatch('@test/plugin');

    // No error
  });

  test('unwatch() is safe for unknown plugins', () => {
    watcher.unwatch('@test/not-watched');

    // No error
  });

  test('stopAll() stops all watchers', () => {
    const hubDir = `${import.meta.dir}/..`;

    watcher.watch('@test/a', hubDir);
    watcher.watch('@test/b', hubDir);
    watcher.stopAll();

    // No error — all watchers closed
  });

  test('triggers reload handler when source file changes', async () => {
    const tmpRoot = await realpath(await mkdtemp(join(tmpdir(), 'brika-watcher-test-')));
    const srcDir = join(tmpRoot, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'index.ts'), 'export const a = 1;');

    // Provide a real PluginWatcher so autoStub doesn't replace it with a proxy
    stub(Logger);
    provide(PluginWatcher, new PluginWatcher());
    const realWatcher = get(PluginWatcher);
    const handler = mock();
    realWatcher.setReloadHandler(handler);

    realWatcher.watch('@test/trigger', tmpRoot);

    // Allow FS watcher to fully register before modifying
    await new Promise((r) => setTimeout(r, 200));
    await writeFile(join(srcDir, 'index.ts'), 'export const a = 2;');

    // Wait for debounce (DEBOUNCE_MS = 500) + buffer
    await new Promise((r) => setTimeout(r, 1000));

    expect(handler).toHaveBeenCalledWith('@test/trigger');

    realWatcher.unwatch('@test/trigger');
    await rm(tmpRoot, { recursive: true, force: true });
  });

  test('does not trigger reload for non-source files', async () => {
    const tmpRoot = await realpath(await mkdtemp(join(tmpdir(), 'brika-watcher-test-')));
    const srcDir = join(tmpRoot, 'src');
    await mkdir(srcDir, { recursive: true });

    stub(Logger);
    provide(PluginWatcher, new PluginWatcher());
    const realWatcher = get(PluginWatcher);
    const handler = mock();
    realWatcher.setReloadHandler(handler);

    realWatcher.watch('@test/no-trigger', tmpRoot);

    await new Promise((r) => setTimeout(r, 200));
    await writeFile(join(srcDir, 'data.json'), '{"a":1}');

    await new Promise((r) => setTimeout(r, 1000));

    expect(handler).not.toHaveBeenCalled();

    realWatcher.unwatch('@test/no-trigger');
    await rm(tmpRoot, { recursive: true, force: true });
  });

  test('debounces multiple rapid changes into one reload', async () => {
    const tmpRoot = await realpath(await mkdtemp(join(tmpdir(), 'brika-watcher-test-')));
    const srcDir = join(tmpRoot, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'index.ts'), 'export const a = 1;');

    stub(Logger);
    provide(PluginWatcher, new PluginWatcher());
    const realWatcher = get(PluginWatcher);
    const handler = mock();
    realWatcher.setReloadHandler(handler);

    realWatcher.watch('@test/debounce', tmpRoot);

    await new Promise((r) => setTimeout(r, 200));
    // Multiple rapid writes
    await writeFile(join(srcDir, 'index.ts'), 'export const a = 2;');
    await new Promise((r) => setTimeout(r, 50));
    await writeFile(join(srcDir, 'index.ts'), 'export const a = 3;');
    await new Promise((r) => setTimeout(r, 50));
    await writeFile(join(srcDir, 'index.ts'), 'export const a = 4;');

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 1000));

    // Should only fire once due to debounce
    expect(handler).toHaveBeenCalledTimes(1);

    realWatcher.unwatch('@test/debounce');
    await rm(tmpRoot, { recursive: true, force: true });
  });

  test('unwatch cancels pending reload timer', async () => {
    const tmpRoot = await realpath(await mkdtemp(join(tmpdir(), 'brika-watcher-test-')));
    const srcDir = join(tmpRoot, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'index.ts'), 'export const a = 1;');

    stub(Logger);
    provide(PluginWatcher, new PluginWatcher());
    const realWatcher = get(PluginWatcher);
    const handler = mock();
    realWatcher.setReloadHandler(handler);

    realWatcher.watch('@test/cancel', tmpRoot);

    await new Promise((r) => setTimeout(r, 200));
    await writeFile(join(srcDir, 'index.ts'), 'export const a = 2;');

    // Unwatch before debounce fires (within 500ms window)
    await new Promise((r) => setTimeout(r, 200));
    realWatcher.unwatch('@test/cancel');

    // Wait past debounce period
    await new Promise((r) => setTimeout(r, 1000));

    expect(handler).not.toHaveBeenCalled();

    await rm(tmpRoot, { recursive: true, force: true });
  });

  test('triggers reload for .css file changes', async () => {
    const tmpRoot = await realpath(await mkdtemp(join(tmpdir(), 'brika-watcher-test-')));
    const srcDir = join(tmpRoot, 'src');
    await mkdir(srcDir, { recursive: true });

    stub(Logger);
    provide(PluginWatcher, new PluginWatcher());
    const realWatcher = get(PluginWatcher);
    const handler = mock();
    realWatcher.setReloadHandler(handler);

    realWatcher.watch('@test/css', tmpRoot);

    await new Promise((r) => setTimeout(r, 200));
    await writeFile(join(srcDir, 'styles.css'), 'body { color: red; }');

    await new Promise((r) => setTimeout(r, 1000));

    expect(handler).toHaveBeenCalledWith('@test/css');

    realWatcher.unwatch('@test/css');
    await rm(tmpRoot, { recursive: true, force: true });
  });
});
