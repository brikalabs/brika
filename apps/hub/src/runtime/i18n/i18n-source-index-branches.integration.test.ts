/**
 * Branch coverage for `SourceIndex` — covers the index mutation surface
 * (record / forget / forgetNonPlugin / list / get) and the write-path
 * fallbacks not exercised by the security suite in `i18n-source-index.test.ts`.
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranslationRegistry } from '@brika/i18n';
import { SourceIndex } from '@/runtime/i18n/i18n-source-index';
import type { SourceFileEntry } from '@/runtime/i18n/i18n-types';

const buildEntry = (
  namespace: string,
  locale: string,
  path: string,
  kind: SourceFileEntry['kind']
): SourceFileEntry => ({ namespace, locale, path, kind });

describe('SourceIndex — mutation surface', () => {
  let registry: TranslationRegistry;
  let sources: SourceIndex;

  beforeEach(() => {
    registry = new TranslationRegistry();
    sources = new SourceIndex({
      registry,
      getAllowedRoots: () => [],
    });
  });

  test('record() inserts entries and overwrites existing pairs', () => {
    sources.record(buildEntry('common', 'en', '/a/en/common.json', 'hub'));
    sources.record(buildEntry('common', 'fr', '/a/fr/common.json', 'hub'));
    sources.record(buildEntry('common', 'en', '/b/en/common.json', 'hub'));

    expect(sources.get('common', 'en')?.path).toBe('/b/en/common.json');
    expect(sources.get('common', 'fr')?.path).toBe('/a/fr/common.json');
  });

  test('get() returns undefined for unknown namespace or locale', () => {
    sources.record(buildEntry('common', 'en', '/a/en/common.json', 'hub'));

    expect(sources.get('common', 'en')).toBeDefined();
    expect(sources.get('common', 'fr')).toBeUndefined();
    expect(sources.get('missing', 'en')).toBeUndefined();
  });

  test('list() sorts by namespace then locale', () => {
    sources.record(buildEntry('zeta', 'en', '/z.json', 'hub'));
    sources.record(buildEntry('alpha', 'fr', '/a-fr.json', 'hub'));
    sources.record(buildEntry('alpha', 'en', '/a-en.json', 'hub'));
    sources.record(buildEntry('alpha', 'de', '/a-de.json', 'hub'));

    const list = sources.list();
    expect(list.map((e) => `${e.namespace}:${e.locale}`)).toEqual([
      'alpha:de',
      'alpha:en',
      'alpha:fr',
      'zeta:en',
    ]);
  });

  test('forget(ns, locale) drops one pair and prunes empty namespaces', () => {
    sources.record(buildEntry('common', 'en', '/a.json', 'hub'));
    sources.record(buildEntry('common', 'fr', '/b.json', 'hub'));

    sources.forget('common', 'en');
    expect(sources.get('common', 'en')).toBeUndefined();
    expect(sources.get('common', 'fr')).toBeDefined();

    sources.forget('common', 'fr');
    expect(sources.list()).toEqual([]);
  });

  test('forget(ns) without a locale drops the entire namespace', () => {
    sources.record(buildEntry('common', 'en', '/a.json', 'hub'));
    sources.record(buildEntry('common', 'fr', '/b.json', 'hub'));
    sources.record(buildEntry('nav', 'en', '/c.json', 'hub'));

    sources.forget('common');
    expect(sources.get('common', 'en')).toBeUndefined();
    expect(sources.get('common', 'fr')).toBeUndefined();
    expect(sources.get('nav', 'en')).toBeDefined();
  });

  test('forget() is a no-op for unknown namespace/locale combinations', () => {
    sources.record(buildEntry('common', 'en', '/a.json', 'hub'));

    sources.forget('unknown');
    sources.forget('common', 'fr');

    expect(sources.list()).toHaveLength(1);
  });

  test('forgetNonPlugin() drops hub + package entries, keeps plugin entries', () => {
    sources.record(buildEntry('common', 'en', '/hub.json', 'hub'));
    sources.record(buildEntry('permissions', 'en', '/pkg.json', 'package'));
    sources.record(buildEntry('plugin:@brika/timer', 'en', '/plug.json', 'plugin'));
    sources.record(buildEntry('common', 'fr', '/hub-fr.json', 'hub'));

    sources.forgetNonPlugin();

    expect(sources.get('common', 'en')).toBeUndefined();
    expect(sources.get('common', 'fr')).toBeUndefined();
    expect(sources.get('permissions', 'en')).toBeUndefined();
    expect(sources.get('plugin:@brika/timer', 'en')?.kind).toBe('plugin');
  });

  test('forgetNonPlugin() retains a namespace if a plugin locale remains', () => {
    sources.record(buildEntry('mixed', 'en', '/hub.json', 'hub'));
    sources.record(buildEntry('mixed', 'fr', '/plug.json', 'plugin'));

    sources.forgetNonPlugin();

    expect(sources.get('mixed', 'en')).toBeUndefined();
    expect(sources.get('mixed', 'fr')?.kind).toBe('plugin');
  });
});

describe('SourceIndex.write — fallback handling', () => {
  let workDir: string;
  let registry: TranslationRegistry;
  let sources: SourceIndex;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'brika-srcidx-'));
    mkdirSync(join(workDir, 'en'), { recursive: true });
    registry = new TranslationRegistry();
    sources = new SourceIndex({
      registry,
      getAllowedRoots: () => [workDir],
    });
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  test('treats an empty file as `{}` and writes the new key', async () => {
    // `ensureSafePath` runs `realpath` first, which requires the file to exist
    // — so the "missing file → empty tree" fallback in `readTranslationJson`
    // is only reachable when the file is present but blank.
    const path = join(workDir, 'en', 'common.json');
    writeFileSync(path, '');
    sources.record(buildEntry('common', 'en', path, 'hub'));

    await sources.write('common', 'en', 'greeting', 'Hi');

    expect(registry.getNamespaceTranslations('en', 'common')).toEqual({ greeting: 'Hi' });
    const onDisk = JSON.parse(await Bun.file(path).text());
    expect(onDisk).toEqual({ greeting: 'Hi' });
  });

  test('treats an unparseable file as `{}` and rewrites it', async () => {
    const path = join(workDir, 'en', 'common.json');
    writeFileSync(path, '{not-json');
    sources.record(buildEntry('common', 'en', path, 'hub'));

    await sources.write('common', 'en', 'k', 'v');

    expect(registry.getNamespaceTranslations('en', 'common')).toEqual({ k: 'v' });
  });

  test('treats a non-object JSON root as `{}` and rewrites it', async () => {
    const path = join(workDir, 'en', 'common.json');
    writeFileSync(path, '"string"');
    sources.record(buildEntry('common', 'en', path, 'hub'));

    await sources.write('common', 'en', 'k', 'v');

    expect(registry.getNamespaceTranslations('en', 'common')).toEqual({ k: 'v' });
  });

  test('applies the entry kind as the registry source tag', async () => {
    const path = join(workDir, 'en', 'foo.json');
    writeFileSync(path, '{}');
    sources.record(buildEntry('foo', 'en', path, 'package'));

    let observedSource: string | undefined;
    registry.onChange((change) => {
      if (change.kind === 'set' && change.source) {
        observedSource = change.source;
      }
    });

    await sources.write('foo', 'en', 'a', 'b');

    expect(observedSource).toBe('package');
  });

  test('preserves nested keys when writing a new leaf', async () => {
    const path = join(workDir, 'en', 'common.json');
    writeFileSync(path, JSON.stringify({ nav: { home: 'Home' } }));
    sources.record(buildEntry('common', 'en', path, 'hub'));

    await sources.write('common', 'en', 'nav.about', 'About');

    expect(registry.getNamespaceTranslations('en', 'common')).toEqual({
      nav: { home: 'Home', about: 'About' },
    });
  });
});
