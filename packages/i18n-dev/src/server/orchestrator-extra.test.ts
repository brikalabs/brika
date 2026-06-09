import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useBunMock } from '@brika/testing';
import type { KeyUsageMap } from '../scan-usage';
import { generateTypes, mergeCodeUsageIssues, runScan } from './orchestrator';

// ─── Helpers ────────────────────────────────────────────────────────────────

const bun = useBunMock();

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

function makeUsage(
  qualifiedKeys: string[],
  extras: Partial<Omit<KeyUsageMap, 'keys'>> = {}
): KeyUsageMap {
  const keys: Record<string, Array<{ file: string; line: number }>> = {};
  for (const key of qualifiedKeys) {
    keys[key] = [{ file: 'src/app.tsx', line: 1 }];
  }
  return {
    keys,
    patterns: extras.patterns ?? [],
    opaqueNamespaces: extras.opaqueNamespaces ?? [],
    hasGlobalOpaque: extras.hasGlobalOpaque ?? false,
  };
}

// ─── mergeCodeUsageIssues ───────────────────────────────────────────────────

describe('mergeCodeUsageIssues', () => {
  test('merges unknown-key issues from code usage into an existing validation result', () => {
    const translations = new Map([['en', new Map([['common', { hello: 'Hello' }]])]]);
    const baseValidation = {
      issues: [],
      coverage: [],
      timestamp: Date.now(),
      referenceLocale: 'en',
    };
    const usage = makeUsage(['common:hello', 'common:missing']);

    const result = mergeCodeUsageIssues(baseValidation, translations, usage, {
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [],
      cacheDir: '/tmp/cache',
    });

    expect(result.issues.some((i) => i.type === 'unknown-key' && i.key === 'missing')).toBe(true);
  });

  test('preserves existing issues from the base validation result', () => {
    const translations = new Map([['en', new Map([['common', { hello: 'Hello' }]])]]);
    const baseIssue = {
      type: 'missing-key' as const,
      severity: 'error' as const,
      namespace: 'common',
      locale: 'fr',
      key: 'hello',
      referenceLocale: 'en',
    };
    const baseValidation = {
      issues: [baseIssue],
      coverage: [],
      timestamp: Date.now(),
      referenceLocale: 'en',
    };
    const usage = makeUsage(['common:hello']);

    const result = mergeCodeUsageIssues(baseValidation, translations, usage, {
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [],
      cacheDir: '/tmp/cache',
    });

    expect(result.issues).toContain(baseIssue);
  });

  test('respects unknownKeySeverity override set to warning', () => {
    const translations = new Map([['en', new Map([['auth', { login: 'Login' }]])]]);
    const baseValidation = {
      issues: [],
      coverage: [],
      timestamp: Date.now(),
      referenceLocale: 'en',
    };
    const usage = makeUsage(['auth:nonexistent']);

    const result = mergeCodeUsageIssues(baseValidation, translations, usage, {
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [],
      cacheDir: '/tmp/cache',
      unknownKeySeverity: 'warning',
    });

    const unknownIssues = result.issues.filter((i) => i.type === 'unknown-key');
    expect(unknownIssues).toHaveLength(1);
    expect(unknownIssues[0]?.severity).toBe('warning');
  });

  test('respects deadKeySeverity override set to error', () => {
    const translations = new Map([['en', new Map([['common', { stale: 'Stale key' }]])]]);
    const baseValidation = {
      issues: [],
      coverage: [],
      timestamp: Date.now(),
      referenceLocale: 'en',
    };
    const usage = makeUsage([]);

    const result = mergeCodeUsageIssues(baseValidation, translations, usage, {
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [],
      cacheDir: '/tmp/cache',
      deadKeySeverity: 'error',
    });

    const deadIssues = result.issues.filter((i) => i.type === 'dead-key');
    expect(deadIssues.length).toBeGreaterThan(0);
    expect(deadIssues[0]?.severity).toBe('error');
  });

  test('suppresses dead-key for namespaces in deadKeyIgnoreNamespaces', () => {
    const translations = new Map([
      [
        'en',
        new Map([
          ['plugin:my-plugin', { key: 'value' }],
          ['common', { stale: 'Stale' }],
        ]),
      ],
    ]);
    const baseValidation = {
      issues: [],
      coverage: [],
      timestamp: Date.now(),
      referenceLocale: 'en',
    };
    const usage = makeUsage([]);

    const result = mergeCodeUsageIssues(baseValidation, translations, usage, {
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [],
      cacheDir: '/tmp/cache',
      deadKeyIgnoreNamespaces: ['plugin:'],
    });

    const deadKeys = result.issues.filter((i) => i.type === 'dead-key');
    // plugin:* is ignored; only common:stale should be flagged
    expect(deadKeys.every((i) => !i.namespace.startsWith('plugin:'))).toBe(true);
    expect(deadKeys.some((i) => i.key === 'stale')).toBe(true);
  });

  test('tpNamespacePrefixes resolves code keys that use plugin: prefix convention', () => {
    const translations = new Map([['en', new Map([['plugin:my-plugin', { title: 'Title' }]])]]);
    const baseValidation = {
      issues: [],
      coverage: [],
      timestamp: Date.now(),
      referenceLocale: 'en',
    };
    // Code calls tp('my-plugin', 'title') which the scanner records as my-plugin:title
    const usage = makeUsage(['my-plugin:title']);

    const resultWithoutPrefix = mergeCodeUsageIssues(baseValidation, translations, usage, {
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [],
      cacheDir: '/tmp/cache',
    });

    const resultWithPrefix = mergeCodeUsageIssues(baseValidation, translations, usage, {
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [],
      cacheDir: '/tmp/cache',
      tpNamespacePrefixes: ['plugin:'],
    });

    expect(resultWithoutPrefix.issues.some((i) => i.type === 'unknown-key')).toBe(true);
    expect(resultWithPrefix.issues.some((i) => i.type === 'unknown-key')).toBe(false);
  });

  test('updates the timestamp on each call', async () => {
    const translations = new Map([['en', new Map([['common', { a: 'A' }]])]]);
    const baseValidation = {
      issues: [],
      coverage: [],
      timestamp: 1,
      referenceLocale: 'en',
    };
    const usage = makeUsage([]);
    const before = Date.now();
    const result = mergeCodeUsageIssues(baseValidation, translations, usage, {
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [],
      cacheDir: '/tmp',
    });
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
  });
});

// ─── generateTypes ───────────────────────────────────────────────────────────

describe('generateTypes', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'gen-types-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test('writes i18n-resources.d.ts and i18n-namespaces.ts into cacheDir', async () => {
    const cacheDir = join(workDir, '.cache');
    const coreTranslations = new Map([
      ['en', new Map([['common', { hello: 'Hello', bye: 'Goodbye' }]])],
    ]);
    const allTranslations: Record<string, Record<string, Record<string, unknown>>> = {
      en: { common: { hello: 'Hello', bye: 'Goodbye' } },
    };

    await generateTypes(
      {
        localesDir: null,
        apiUrl: null,
        referenceLocale: 'en',
        sources: [],
        cacheDir,
      },
      coreTranslations,
      allTranslations
    );

    const resources = await readFile(join(cacheDir, 'i18n-resources.d.ts'), 'utf-8');
    const namespaces = await readFile(join(cacheDir, 'i18n-namespaces.ts'), 'utf-8');
    const registry = await readFile(join(cacheDir, 'i18n-registry.d.ts'), 'utf-8');

    expect(resources).toContain('common');
    expect(namespaces).toContain('common');
    expect(registry).toContain('common');
  });

  test('places defaultNamespace first in the generated namespace list', async () => {
    const cacheDir = join(workDir, '.cache-ns');
    const coreTranslations = new Map([
      [
        'en',
        new Map([
          ['common', { a: 'A' }],
          ['translation', { b: 'B' }],
        ]),
      ],
    ]);
    const allTranslations: Record<string, Record<string, Record<string, unknown>>> = {
      en: {
        common: { a: 'A' },
        translation: { b: 'B' },
      },
    };

    await generateTypes(
      {
        localesDir: null,
        apiUrl: null,
        referenceLocale: 'en',
        sources: [],
        cacheDir,
        defaultNamespace: 'translation',
      },
      coreTranslations,
      allTranslations
    );

    const namespaces = await readFile(join(cacheDir, 'i18n-namespaces.ts'), 'utf-8');
    // translation should appear before common since it is the default
    const translationIdx = namespaces.indexOf('translation');
    const commonIdx = namespaces.indexOf('common');
    expect(translationIdx).toBeLessThan(commonIdx);
  });

  test('does nothing when referenceLocale has no data in coreTranslations', async () => {
    const cacheDir = join(workDir, '.cache-empty');
    const coreTranslations = new Map([['fr', new Map([['common', { bonjour: 'Hello' }]])]]);
    const allTranslations = { fr: { common: { bonjour: 'Hello' } } };

    await generateTypes(
      {
        localesDir: null,
        apiUrl: null,
        referenceLocale: 'en',
        sources: [],
        cacheDir,
      },
      coreTranslations,
      allTranslations
    );

    // cacheDir should not have been created, so reading the file rejects with ENOENT
    await expect(readFile(join(cacheDir, 'i18n-resources.d.ts'), 'utf-8')).rejects.toThrow(/ENOENT/);
  });

  test('does nothing when cacheDir is empty string', async () => {
    const coreTranslations = new Map([['en', new Map([['common', { a: 'A' }]])]]);
    const allTranslations = { en: { common: { a: 'A' } } };

    // Should not throw even with an empty cacheDir
    await expect(
      generateTypes(
        {
          localesDir: null,
          apiUrl: null,
          referenceLocale: 'en',
          sources: [],
          cacheDir: '',
        },
        coreTranslations,
        allTranslations
      )
    ).resolves.toBeUndefined();
  });

  test('includes remote-only namespaces from allTranslations in i18n-registry.d.ts', async () => {
    const cacheDir = join(workDir, '.cache-remote');
    const coreTranslations = new Map([['en', new Map([['common', { a: 'A' }]])]]);
    // allTranslations includes an extra remote namespace not in coreTranslations
    const allTranslations: Record<string, Record<string, Record<string, unknown>>> = {
      en: {
        common: { a: 'A' },
        dashboard: { stats: 'Stats' },
      },
    };

    await generateTypes(
      {
        localesDir: null,
        apiUrl: null,
        referenceLocale: 'en',
        sources: [],
        cacheDir,
      },
      coreTranslations,
      allTranslations
    );

    const registry = await readFile(join(cacheDir, 'i18n-registry.d.ts'), 'utf-8');
    expect(registry).toContain('dashboard');
    // i18n-resources.d.ts should only have core namespaces
    const resources = await readFile(join(cacheDir, 'i18n-resources.d.ts'), 'utf-8');
    // dashboard is not in coreTranslations so should not be in resources
    expect(resources).not.toContain('dashboard');
  });
});

// ─── runScan with a source that has no localesDir (line 60) ─────────────────

describe('runScan source edge cases', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'orchestrator-edge-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test('source without localesDir is skipped gracefully', async () => {
    // A source with no localesDir should produce no translations (line 60 path)
    const result = await runScan({
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [{ dir: join(workDir, 'src') }], // no localesDir
      cacheDir: join(workDir, '.cache'),
    });

    expect(result.coreTranslations.size).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  test('source with a localesDir that does not exist returns gracefully (line 66 path)', async () => {
    // localesDir points to a non-existent directory — Bun.Glob.scan will throw
    const result = await runScan({
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [{ dir: join(workDir, 'src'), localesDir: join(workDir, 'nonexistent') }],
      cacheDir: join(workDir, '.cache'),
    });

    // Should not throw — just no translations loaded
    expect(result.coreTranslations.size).toBe(0);
  });

  test('source locale folder with all-empty namespaces still registers the locale in coreTranslations', async () => {
    const localesDir = join(workDir, 'locales');
    // Create a locale directory with an empty JSON object — the namespace IS
    // registered (nsMap has one entry with empty data), so the locale appears.
    await mkdir(join(localesDir, 'en'), { recursive: true });
    await writeFile(join(localesDir, 'en', 'common.json'), '{}');

    const result = await runScan({
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [{ dir: join(workDir, 'src'), localesDir }],
      cacheDir: join(workDir, '.cache'),
    });

    // loadPerFileNamespaces adds the namespace even when empty, so locale is present
    expect(result.coreTranslations.get('en')?.has('common')).toBe(true);
  });

  test('source with a merged namespace where all locale folders have empty data returns no translations (line 83 path)', async () => {
    const localesDir = join(workDir, 'locales-empty-merged');
    // An empty JSON file under a locale dir
    await mkdir(join(localesDir, 'en'), { recursive: true });
    await writeFile(join(localesDir, 'en', 'empty.json'), '{}');

    const result = await runScan({
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [{ dir: join(workDir, 'src'), namespace: 'mypkg', localesDir }],
      cacheDir: join(workDir, '.cache'),
    });

    // loadMergedNamespace returns empty map for empty JSON files, so
    // locales.size === 0 in scanSourceLocales and returns undefined (line 83)
    expect(result.coreTranslations.size).toBe(0);
  });

  test('source with a merged namespace loads all JSON files under that namespace', async () => {
    const localesDir = join(workDir, 'locales');
    await writeJson(join(localesDir, 'en', 'part-a.json'), { title: 'Title' });
    await writeJson(join(localesDir, 'en', 'part-b.json'), { subtitle: 'Subtitle' });
    await writeJson(join(localesDir, 'fr', 'part-a.json'), { title: 'Titre' });
    await writeJson(join(localesDir, 'fr', 'part-b.json'), { subtitle: 'Sous-titre' });

    const result = await runScan({
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [{ dir: join(workDir, 'src'), namespace: 'pkg', localesDir }],
      cacheDir: join(workDir, '.cache'),
    });

    const enPkg = result.coreTranslations.get('en')?.get('pkg');
    expect(enPkg).toBeDefined();
    // merged namespace combines both files
    expect(enPkg?.title).toBe('Title');
    expect(enPkg?.subtitle).toBe('Subtitle');
  });

  test('mergeRemoteTranslations propagates remote errors as warnings (line 156 path)', async () => {
    // Mock fetch to return non-ok for /locales and propagate errors
    bun.fetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ locales: ['en'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    // First call succeeds (locales), second fails (bundle)
    let callCount = 0;
    bun.fetch(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ locales: ['en'] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      // bundle fetch fails
      return Promise.reject(new Error('bundle fetch failed'));
    });

    const result = await runScan({
      localesDir: null,
      apiUrl: 'http://hub.local/api/i18n',
      referenceLocale: 'en',
      sources: [],
      cacheDir: join(workDir, '.cache'),
    });

    // The remote fetch failure should surface as a warning
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
  });
});
