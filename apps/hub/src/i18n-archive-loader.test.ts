/**
 * Tests for the embedded-archive loader.
 *
 * Builds tiny gzipped tar archives on the fly so we can exercise the parse,
 * sanitize, and registry-feed paths without relying on the production
 * `@brika/db` macros or the embedded compile-time payload.
 */

import { describe, expect, test } from 'bun:test';
import { TranslationRegistry } from '@brika/i18n';
import {
  loadArchive,
  parseHubArchivePath,
  parsePackageArchivePath,
} from '@/runtime/i18n/i18n-archive-loader';

const encoder = new TextEncoder();

interface ArchiveFile {
  readonly path: string;
  readonly content: string;
}

const buildArchiveBytes = async (files: readonly ArchiveFile[]): Promise<number[]> => {
  const records: Record<string, Uint8Array> = {};
  for (const file of files) {
    records[file.path] = encoder.encode(file.content);
  }
  const archive = new Bun.Archive(records, { compress: 'gzip', level: 9 });
  return Array.from(await archive.bytes());
};

describe('parseHubArchivePath', () => {
  test('parses "<locale>/<ns>.json"', () => {
    expect(parseHubArchivePath('en/common.json')).toEqual({ namespace: 'common', locale: 'en' });
    expect(parseHubArchivePath('fr-CA/nav.json')).toEqual({ namespace: 'nav', locale: 'fr-CA' });
  });

  test('returns null for paths without a slash', () => {
    expect(parseHubArchivePath('common.json')).toBeNull();
  });

  test('returns null when the locale segment is empty', () => {
    expect(parseHubArchivePath('/common.json')).toBeNull();
  });

  test('returns null when the file does not end in .json', () => {
    expect(parseHubArchivePath('en/common.txt')).toBeNull();
    expect(parseHubArchivePath('en/README')).toBeNull();
  });
});

describe('parsePackageArchivePath', () => {
  test('parses "<namespace>/<locale>/<file>.json"', () => {
    expect(parsePackageArchivePath('permissions/en/labels.json')).toEqual({
      namespace: 'permissions',
      locale: 'en',
    });
  });

  test('joins multi-segment file names', () => {
    expect(parsePackageArchivePath('foo/en/nested/path/x.json')).toEqual({
      namespace: 'foo',
      locale: 'en',
    });
  });

  test('returns null when too few segments', () => {
    expect(parsePackageArchivePath('foo.json')).toBeNull();
    expect(parsePackageArchivePath('foo/en')).toBeNull();
  });

  test('returns null when fileName is missing .json', () => {
    expect(parsePackageArchivePath('foo/en/README')).toBeNull();
  });

  test('returns null when namespace or locale is empty', () => {
    expect(parsePackageArchivePath('/en/labels.json')).toBeNull();
    expect(parsePackageArchivePath('foo//labels.json')).toBeNull();
  });
});

describe('loadArchive', () => {
  test('returns early on an empty byte array', async () => {
    const registry = new TranslationRegistry();
    await loadArchive({
      bytes: [],
      source: 'hub',
      parsePath: parseHubArchivePath,
      registry,
      warn: () => {},
    });
    expect(registry.listNamespaces()).toEqual([]);
  });

  test('populates the registry from a well-formed hub archive', async () => {
    const bytes = await buildArchiveBytes([
      { path: 'en/common.json', content: JSON.stringify({ hello: 'Hello' }) },
      { path: 'fr/common.json', content: JSON.stringify({ hello: 'Bonjour' }) },
    ]);

    const registry = new TranslationRegistry();
    await loadArchive({
      bytes,
      source: 'hub',
      parsePath: parseHubArchivePath,
      registry,
      warn: () => {},
    });

    expect(registry.getNamespaceTranslations('en', 'common')).toEqual({ hello: 'Hello' });
    expect(registry.getNamespaceTranslations('fr', 'common')).toEqual({ hello: 'Bonjour' });
  });

  test('skips entries that the path parser rejects', async () => {
    const bytes = await buildArchiveBytes([
      { path: 'README.md', content: '# hi' },
      { path: 'en/common.json', content: '{"k":"v"}' },
    ]);

    const registry = new TranslationRegistry();
    await loadArchive({
      bytes,
      source: 'hub',
      parsePath: parseHubArchivePath,
      registry,
      warn: () => {},
    });

    expect(registry.listNamespaces()).toEqual(['common']);
  });

  test('warns and skips when a JSON entry fails to parse', async () => {
    const bytes = await buildArchiveBytes([
      { path: 'en/common.json', content: '{not-json' },
      { path: 'en/nav.json', content: '{"home":"Home"}' },
    ]);
    const warnings: Array<{ message: string; path: string }> = [];

    const registry = new TranslationRegistry();
    await loadArchive({
      bytes,
      source: 'hub',
      parsePath: parseHubArchivePath,
      registry,
      warn: (message, ctx) => warnings.push({ message, path: ctx.path }),
    });

    expect(warnings.some((w) => w.message.includes('Failed to parse embedded locale'))).toBeTrue();
    expect(registry.getNamespaceTranslations('en', 'common')).toBeNull();
    expect(registry.getNamespaceTranslations('en', 'nav')).toEqual({ home: 'Home' });
  });

  test('warns and skips when JSON root is not an object', async () => {
    const bytes = await buildArchiveBytes([{ path: 'en/common.json', content: '"a-string"' }]);
    const warnings: string[] = [];

    const registry = new TranslationRegistry();
    await loadArchive({
      bytes,
      source: 'hub',
      parsePath: parseHubArchivePath,
      registry,
      warn: (message) => warnings.push(message),
    });

    expect(warnings.some((w) => w.includes('root is not an object'))).toBeTrue();
    expect(registry.listNamespaces()).toEqual([]);
  });

  test('sanitizes prototype-pollution keys before feeding the registry', async () => {
    const bytes = await buildArchiveBytes([
      {
        path: 'en/common.json',
        content: JSON.stringify({ __proto__: { polluted: true }, ok: 'safe' }),
      },
    ]);

    const registry = new TranslationRegistry();
    await loadArchive({
      bytes,
      source: 'hub',
      parsePath: parseHubArchivePath,
      registry,
      warn: () => {},
    });

    const data = registry.getNamespaceTranslations('en', 'common');
    expect(data).toEqual({ ok: 'safe' });
  });

  test('warns with an archive-level identifier when bytes are not a valid gzip stream', async () => {
    const warnings: Array<{ message: string; path: string }> = [];
    const registry = new TranslationRegistry();

    await loadArchive({
      bytes: [1, 2, 3, 4, 5],
      source: 'package',
      parsePath: parsePackageArchivePath,
      registry,
      warn: (message, ctx) => warnings.push({ message, path: ctx.path }),
    });

    expect(warnings.some((w) => w.message.includes('Failed to read package archive'))).toBeTrue();
    expect(warnings.some((w) => w.path === '<embedded:package>')).toBeTrue();
  });

  test('feeds package archive entries with deep-merge semantics', async () => {
    const bytes = await buildArchiveBytes([
      { path: 'permissions/en/labels.json', content: JSON.stringify({ a: 'A', b: 'B' }) },
      { path: 'permissions/en/extra.json', content: JSON.stringify({ c: 'C' }) },
    ]);

    const registry = new TranslationRegistry();
    await loadArchive({
      bytes,
      source: 'package',
      parsePath: parsePackageArchivePath,
      registry,
      warn: () => {},
    });

    // Both files share namespace+locale; archive loader uses `merge: true`, so
    // the second file's keys should fold into the first's.
    expect(registry.getNamespaceTranslations('en', 'permissions')).toEqual({
      a: 'A',
      b: 'B',
      c: 'C',
    });
  });
});
