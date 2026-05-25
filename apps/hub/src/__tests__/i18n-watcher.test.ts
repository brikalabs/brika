/**
 * Tests for `LocaleWatcher` — covers the hub-file and package-folder
 * reload branches. fs.watch is mocked (see `fs-watch-mock.ts`) so events
 * fire deterministically — no real-clock waits for macOS scheduling jitter.
 * The watcher's debounce is dialled down to ~20ms in tests, and assertions
 * use `waitFor` polling that short-circuits as soon as the reload lands.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranslationRegistry } from '@brika/i18n';
import { LocaleWatcher } from '@/runtime/i18n/i18n-watcher';
import { waitFor } from './_test-helpers';
import { FsWatchMock } from './fs-watch-mock';

const TEST_DEBOUNCE_MS = 20;

const noopWarn = (): void => {};

describe('LocaleWatcher', () => {
  let workDir: string;
  let localesDir: string;
  let pkgDir: string;
  let pkgLocalesDir: string;
  let registry: TranslationRegistry;
  let watcher: LocaleWatcher;
  let fsMock: FsWatchMock;
  const installedPaths: string[] = [];
  const errors: Array<{ path: string; error: unknown }> = [];

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'brika-watcher-'));
    localesDir = join(workDir, 'locales');
    pkgDir = join(workDir, 'pkg');
    pkgLocalesDir = join(pkgDir, 'locales');
    mkdirSync(join(localesDir, 'en'), { recursive: true });
    mkdirSync(join(pkgLocalesDir, 'en'), { recursive: true });

    registry = new TranslationRegistry();
    installedPaths.length = 0;
    errors.length = 0;

    fsMock = new FsWatchMock();
    fsMock.apply();
  });

  afterEach(() => {
    watcher?.dispose();
    fsMock.restore();
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
      debounceMs: TEST_DEBOUNCE_MS,
    });

    watcher.start();

    expect(installedPaths).toContain(localesDir);
    expect(installedPaths).toContain(pkgLocalesDir);
  });

  test('dispose() removes installed watchers and is idempotent', () => {
    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map(),
      warn: noopWarn,
      onWatcherError: () => {},
      onWatcherInstalled: (path) => installedPaths.push(path),
      debounceMs: TEST_DEBOUNCE_MS,
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
      debounceMs: TEST_DEBOUNCE_MS,
    });

    watcher.start();
    watcher.start();

    expect(installedPaths).toHaveLength(2);
    expect(installedPaths[0]).toBe(installedPaths[1]);
  });

  test('forwards watcher errors when the path does not exist', () => {
    // The mock never throws on missing dirs, so we restore real fs.watch
    // for this single test to exercise the actual error path.
    fsMock.restore();
    watcher = new LocaleWatcher({
      registry,
      localesDir: join(workDir, 'missing-dir'),
      packageWatches: new Map(),
      warn: noopWarn,
      onWatcherError: (path, error) => errors.push({ path, error }),
      onWatcherInstalled: (path) => installedPaths.push(path),
      debounceMs: TEST_DEBOUNCE_MS,
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
      debounceMs: TEST_DEBOUNCE_MS,
    });
    watcher.start();

    writeFileSync(join(localesDir, 'en', 'common.json'), '{"hello":"world"}');
    fsMock.simulateChange(localesDir, 'en/common.json');
    await waitFor(() => registry.getNamespaceTranslations('en', 'common') !== null);

    expect(registry.getNamespaceTranslations('en', 'common')).toEqual({ hello: 'world' });
  });

  test('removes a hub namespace/locale when its file disappears', async () => {
    writeFileSync(join(localesDir, 'en', 'common.json'), '{"hello":"world"}');
    registry.setNamespaceLocale(
      'common',
      'en',
      { hello: 'world' },
      {
        merge: false,
        source: 'hub',
      }
    );

    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map(),
      warn: noopWarn,
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
      debounceMs: TEST_DEBOUNCE_MS,
    });
    watcher.start();

    rmSync(join(localesDir, 'en', 'common.json'));
    fsMock.simulateChange(localesDir, 'en/common.json');
    await waitFor(() => registry.getNamespaceTranslations('en', 'common') === null);

    expect(registry.getNamespaceTranslations('en', 'common')).toBeNull();
  });

  test('warns when a hub file is malformed JSON and clears stale data', async () => {
    writeFileSync(join(localesDir, 'en', 'common.json'), '{"hello":"world"}');
    registry.setNamespaceLocale(
      'common',
      'en',
      { hello: 'world' },
      {
        merge: false,
        source: 'hub',
      }
    );

    const warnings: Array<{ message: string; path: string }> = [];
    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map(),
      warn: (message, ctx) => warnings.push({ message, path: ctx.path }),
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
      debounceMs: TEST_DEBOUNCE_MS,
    });
    watcher.start();

    writeFileSync(join(localesDir, 'en', 'common.json'), '"not an object"');
    fsMock.simulateChange(localesDir, 'en/common.json');
    await waitFor(() => warnings.some((w) => w.message.includes('root is not an object')));

    expect(warnings.some((w) => w.message.includes('root is not an object'))).toBeTrue();
    expect(registry.getNamespaceTranslations('en', 'common')).toBeNull();
  });

  test('warns and keeps prior data when a hub file is unparseable', async () => {
    writeFileSync(join(localesDir, 'en', 'common.json'), '{"hello":"world"}');
    registry.setNamespaceLocale(
      'common',
      'en',
      { hello: 'world' },
      {
        merge: false,
        source: 'hub',
      }
    );

    const warnings: string[] = [];
    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map(),
      warn: (message) => warnings.push(message),
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
      debounceMs: TEST_DEBOUNCE_MS,
    });
    watcher.start();

    writeFileSync(join(localesDir, 'en', 'common.json'), '{not json');
    fsMock.simulateChange(localesDir, 'en/common.json');
    await waitFor(() => warnings.some((w) => w.includes('Failed to reload hub locale')));

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
      debounceMs: TEST_DEBOUNCE_MS,
    });
    watcher.start();

    writeFileSync(
      join(localesDir, 'en', 'common.json'),
      '{"__proto__":{"polluted":true},"hello":"world"}'
    );
    fsMock.simulateChange(localesDir, 'en/common.json');
    await waitFor(() => registry.getNamespaceTranslations('en', 'common') !== null);

    const data = registry.getNamespaceTranslations('en', 'common');
    expect(data).toEqual({ hello: 'world' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('reloads a package locale by re-merging the entire folder', async () => {
    writeFileSync(join(pkgLocalesDir, 'en', 'a.json'), '{"a":"A"}');
    writeFileSync(join(pkgLocalesDir, 'en', 'b.json'), '{"b":"B"}');

    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map([['pkg', { namespace: 'pkg', rootDir: pkgDir }]]),
      warn: noopWarn,
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
      debounceMs: TEST_DEBOUNCE_MS,
    });
    watcher.start();

    writeFileSync(join(pkgLocalesDir, 'en', 'b.json'), '{"b":"B2","c":"C"}');
    fsMock.simulateChange(pkgLocalesDir, 'en/b.json');
    await waitFor(() => registry.getNamespaceTranslations('en', 'pkg')?.b === 'B2');

    expect(registry.getNamespaceTranslations('en', 'pkg')).toEqual({
      a: 'A',
      b: 'B2',
      c: 'C',
    });
  });

  test('removes a package locale when its folder is emptied', async () => {
    writeFileSync(join(pkgLocalesDir, 'en', 'a.json'), '{"a":"A"}');

    watcher = new LocaleWatcher({
      registry,
      localesDir,
      packageWatches: new Map([['pkg', { namespace: 'pkg', rootDir: pkgDir }]]),
      warn: noopWarn,
      onWatcherError: () => {},
      onWatcherInstalled: () => {},
      debounceMs: TEST_DEBOUNCE_MS,
    });
    watcher.start();

    // Seed the registry — the watcher will clear it once the folder empties.
    registry.setNamespaceLocale(
      'pkg',
      'en',
      { a: 'A' },
      {
        merge: false,
        source: 'package',
      }
    );

    rmSync(join(pkgLocalesDir, 'en', 'a.json'));
    fsMock.simulateChange(pkgLocalesDir, 'en/a.json');
    await waitFor(() => registry.getNamespaceTranslations('en', 'pkg') === null);

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
      debounceMs: TEST_DEBOUNCE_MS,
    });
    watcher.start();

    // .txt is filtered upstream by `watchLocaleSource`, segmentless json
    // is filtered by the hub-file branch. Neither should mutate the registry.
    writeFileSync(join(localesDir, 'en', 'note.txt'), 'hello');
    writeFileSync(join(localesDir, 'top-level.json'), '{"x":1}');
    fsMock.simulateChange(localesDir, 'en/note.txt');
    fsMock.simulateChange(localesDir, 'top-level.json');
    // Wait one debounce window to be sure no reload was triggered.
    await new Promise((r) => setTimeout(r, TEST_DEBOUNCE_MS * 3));

    expect(registry.listNamespaces()).toEqual([]);
  });
});
