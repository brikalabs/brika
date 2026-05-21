/**
 * Tests for `LocaleWatcher` — covers the hub-file and package-folder
 * reload branches end-to-end against the real filesystem. Each test writes
 * fixtures into a tmp dir, lets `fs.watch` fire, and asserts the registry
 * caught up. A short debounce keeps the runtime bounded.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranslationRegistry } from '@brika/i18n';
import { LocaleWatcher } from '@/runtime/i18n/i18n-watcher';

// Defaults: 300ms debounce + macOS scheduling jitter. 1.2s buys enough margin
// for two reloads (one for the initial settle, one for the assertion-triggering
// edit) without dragging the suite out.
const DEBOUNCE_GRACE_MS = 1200;

const flushDebounce = (): Promise<void> => new Promise((r) => setTimeout(r, DEBOUNCE_GRACE_MS));

// Wait for any startup-jitter event to settle before the assertion edit.
const SETTLE_MS = 400;
const settleInitial = (): Promise<void> => new Promise((r) => setTimeout(r, SETTLE_MS));

const noopWarn = (): void => {};

describe('LocaleWatcher', () => {
  let workDir: string;
  let localesDir: string;
  let pkgDir: string;
  let registry: TranslationRegistry;
  let watcher: LocaleWatcher;
  const installedPaths: string[] = [];
  const errors: Array<{ path: string; error: unknown }> = [];

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'brika-watcher-'));
    localesDir = join(workDir, 'locales');
    pkgDir = join(workDir, 'pkg');
    mkdirSync(join(localesDir, 'en'), { recursive: true });
    mkdirSync(join(pkgDir, 'locales', 'en'), { recursive: true });

    registry = new TranslationRegistry();
    installedPaths.length = 0;
    errors.length = 0;
  });

  afterEach(() => {
    watcher?.dispose();
    rmSync(workDir, { recursive: true, force: true });
  });

  test('installs watchers for hub and every package on start()', () => {
    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map([['pkg', { namespace: 'pkg', rootDir: pkgDir }]]),
      warn: noopWarn,
      onWatcherError: (path, error) => errors.push({ path, error }),
      onWatcherInstalled: (path) => installedPaths.push(path),
    });

    watcher.start();

    expect(installedPaths).toContain(localesDir);
    expect(installedPaths).toContain(`${pkgDir}/locales`);
  });

  test('dispose() removes installed watchers and is idempotent', () => {
    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map(),
      warn: noopWarn,
      onWatcherError: () => {},
      onWatcherInstalled: (path) => installedPaths.push(path),
    });
    watcher.start();
    expect(installedPaths).toHaveLength(1);

    watcher.dispose();
    watcher.dispose();

    // start() after dispose() re-installs the watchers.
    watcher.start();
    expect(installedPaths).toHaveLength(2);
  });

  test('start() called twice replaces the previous watchers', () => {
    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map(),
      warn: noopWarn,
      onWatcherError: () => {},
      onWatcherInstalled: (path) => installedPaths.push(path),
    });

    watcher.start();
    watcher.start();

    expect(installedPaths).toHaveLength(2);
    expect(installedPaths[0]).toBe(installedPaths[1]);
  });

  test('forwards watcher errors when the path does not exist', () => {
    watcher = new LocaleWatcher({
      registry,
      localesDir: join(workDir, 'missing-dir'),
      packageWatches: new Map(),
      warn: noopWarn,
      onWatcherError: (path, error) => errors.push({ path, error }),
      onWatcherInstalled: (path) => installedPaths.push(path),
    });
    watcher.start();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe(join(workDir, 'missing-dir'));
  });

  test('reloads a hub file edit into the registry', async () => {
    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map(),
      warn: noopWarn,
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
    });
    watcher.start();
    await settleInitial();

    writeFileSync(join(localesDir, 'en', 'common.json'), '{"hello":"world"}');
    await flushDebounce();

    expect(registry.getNamespaceTranslations('en', 'common')).toEqual({ hello: 'world' });
  });

  test('removes a hub namespace/locale when its file disappears', async () => {
    writeFileSync(join(localesDir, 'en', 'common.json'), '{"hello":"world"}');
    registry.setNamespaceLocale('common', 'en', { hello: 'world' }, {
      merge: false,
      source: 'hub',
    });

    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map(),
      warn: noopWarn,
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
    });
    watcher.start();
    await settleInitial();

    rmSync(join(localesDir, 'en', 'common.json'));
    await flushDebounce();

    expect(registry.getNamespaceTranslations('en', 'common')).toBeNull();
  });

  test('warns when a hub file is malformed JSON and clears stale data', async () => {
    writeFileSync(join(localesDir, 'en', 'common.json'), '{"hello":"world"}');
    registry.setNamespaceLocale('common', 'en', { hello: 'world' }, {
      merge: false,
      source: 'hub',
    });

    const warnings: Array<{ message: string; path: string }> = [];
    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map(),
      warn: (message, ctx) => warnings.push({ message, path: ctx.path }),
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
    });
    watcher.start();
    await settleInitial();

    writeFileSync(join(localesDir, 'en', 'common.json'), '"not an object"');
    await flushDebounce();

    expect(warnings.some((w) => w.message.includes('root is not an object'))).toBeTrue();
    expect(registry.getNamespaceTranslations('en', 'common')).toBeNull();
  });

  test('warns and keeps prior data when a hub file is unparseable', async () => {
    writeFileSync(join(localesDir, 'en', 'common.json'), '{"hello":"world"}');
    registry.setNamespaceLocale('common', 'en', { hello: 'world' }, {
      merge: false,
      source: 'hub',
    });

    const warnings: string[] = [];
    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map(),
      warn: (message) => warnings.push(message),
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
    });
    watcher.start();
    await settleInitial();

    writeFileSync(join(localesDir, 'en', 'common.json'), '{not json');
    await flushDebounce();

    expect(warnings.some((w) => w.includes('Failed to reload hub locale'))).toBeTrue();
    expect(registry.getNamespaceTranslations('en', 'common')).toEqual({ hello: 'world' });
  });

  test('strips unsafe keys from hub file reloads via sanitizer', async () => {
    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map(),
      warn: noopWarn,
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
    });
    watcher.start();
    await settleInitial();

    writeFileSync(
      join(localesDir, 'en', 'common.json'),
      '{"__proto__":{"polluted":true},"hello":"world"}'
    );
    await flushDebounce();

    const data = registry.getNamespaceTranslations('en', 'common');
    expect(data).toEqual({ hello: 'world' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('reloads a package locale by re-merging the entire folder', async () => {
    writeFileSync(join(pkgDir, 'locales', 'en', 'a.json'), '{"a":"A"}');
    writeFileSync(join(pkgDir, 'locales', 'en', 'b.json'), '{"b":"B"}');

    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map([['pkg', { namespace: 'pkg', rootDir: pkgDir }]]),
      warn: noopWarn,
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
    });
    watcher.start();
    await settleInitial();

    writeFileSync(join(pkgDir, 'locales', 'en', 'b.json'), '{"b":"B2","c":"C"}');
    await flushDebounce();

    expect(registry.getNamespaceTranslations('en', 'pkg')).toEqual({
      a: 'A',
      b: 'B2',
      c: 'C',
    });
  });

  test('removes a package locale when its folder is emptied', async () => {
    writeFileSync(join(pkgDir, 'locales', 'en', 'a.json'), '{"a":"A"}');

    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map([['pkg', { namespace: 'pkg', rootDir: pkgDir }]]),
      warn: noopWarn,
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
    });
    watcher.start();
    await settleInitial();

    // Seed the registry — the watcher will clear it once the folder empties.
    registry.setNamespaceLocale('pkg', 'en', { a: 'A' }, {
      merge: false,
      source: 'package',
    });

    rmSync(join(pkgDir, 'locales', 'en', 'a.json'));
    await flushDebounce();

    expect(registry.getNamespaceTranslations('en', 'pkg')).toBeNull();
  });

  test('ignores non-json events and segment-less paths', async () => {
    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map(),
      warn: noopWarn,
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
    });
    watcher.start();

    // .txt is filtered upstream by `watchLocaleSource`, segmentless json
    // is filtered by the hub-file branch. Neither should mutate the registry.
    writeFileSync(join(localesDir, 'en', 'note.txt'), 'hello');
    writeFileSync(join(localesDir, 'top-level.json'), '{"x":1}');
    await flushDebounce();

    expect(registry.listNamespaces()).toEqual([]);
  });
});
