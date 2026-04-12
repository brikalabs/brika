import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  applyFixToJson,
  applyFixes,
  applyFixesToFile,
  detectIndent,
  resolveTranslationFile,
} from './vite';
import type { FixEntry } from './types';

// ─── detectIndent ──────────────────────────────────────────────────────────

describe('detectIndent', () => {
  test('detects tab indentation', () => {
    expect(detectIndent('{\n\t"key": "val"\n}')).toBe('\t');
  });

  test('detects 2-space indentation', () => {
    expect(detectIndent('{\n  "key": "val"\n}')).toBe(2);
  });

  test('detects 4-space indentation', () => {
    expect(detectIndent('{\n    "key": "val"\n}')).toBe(4);
  });

  test('defaults to tab when no newline', () => {
    expect(detectIndent('{}')).toBe('\t');
  });

  test('defaults to tab when newline at end of content', () => {
    expect(detectIndent('{"a":"b"}\n')).toBe('\t');
  });

  test('defaults to tab for non-whitespace after newline', () => {
    expect(detectIndent('line1\nline2')).toBe('\t');
  });
});

// ─── applyFixToJson ────────────────────────────────────────────────────────

describe('applyFixToJson', () => {
  test('sets a value at top-level key', () => {
    const json: Record<string, unknown> = { hello: 'Hello' };
    const result = applyFixToJson(json, {
      type: 'set',
      locale: 'fr',
      namespace: 'common',
      key: 'hello',
      value: 'Bonjour',
    });
    expect(result).toBe(true);
    expect(json.hello).toBe('Bonjour');
  });

  test('sets a value at nested key', () => {
    const json: Record<string, unknown> = {};
    const result = applyFixToJson(json, {
      type: 'set',
      locale: 'fr',
      namespace: 'common',
      key: 'nav.home',
      value: 'Accueil',
    });
    expect(result).toBe(true);
    expect((json.nav as Record<string, unknown>).home).toBe('Accueil');
  });

  test('deletes a top-level key', () => {
    const json: Record<string, unknown> = { hello: 'Hello', extra: 'Extra' };
    const result = applyFixToJson(json, {
      type: 'delete',
      locale: 'fr',
      namespace: 'common',
      key: 'extra',
    });
    expect(result).toBe(true);
    expect(json.extra).toBeUndefined();
  });

  test('returns false when set has no value', () => {
    const json: Record<string, unknown> = {};
    const result = applyFixToJson(json, {
      type: 'set',
      locale: 'fr',
      namespace: 'common',
      key: 'hello',
    });
    expect(result).toBe(false);
  });
});

// ─── resolveTranslationFile ────────────────────────────────────────────────

describe('resolveTranslationFile', () => {
  test('resolves core namespace path', () => {
    const result = resolveTranslationFile('en', 'common', '/locales', new Map());
    expect(result).toBe(join('/locales', 'en', 'common.json'));
  });

  test('resolves plugin namespace path', () => {
    const pathMap = new Map([['@scope/my-plugin', '/plugins/my-plugin']]);
    const result = resolveTranslationFile('fr', 'plugin:@scope/my-plugin', '/locales', pathMap);
    expect(result).toBe(join('/plugins/my-plugin', 'locales', 'fr', 'plugin.json'));
  });

  test('throws for unknown plugin package', () => {
    expect(() =>
      resolveTranslationFile('en', 'plugin:unknown-pkg', '/locales', new Map())
    ).toThrow('Unknown plugin package: unknown-pkg');
  });
});

// ─── applyFixesToFile ──────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'vite-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('applyFixesToFile', () => {
  test('applies set fix and preserves indent', async () => {
    const fp = join(tempDir, 'test.json');
    await writeFile(fp, JSON.stringify({ hello: 'Hello' }, null, 2) + '\n');

    const applied = await applyFixesToFile(fp, [
      { type: 'set', locale: 'fr', namespace: 'common', key: 'hello', value: 'Bonjour' },
    ]);
    expect(applied).toBe(1);

    const content = await readFile(fp, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.hello).toBe('Bonjour');
    // Verify 2-space indent is preserved
    expect(content).toContain('  "hello"');
  });

  test('applies delete fix', async () => {
    const fp = join(tempDir, 'test.json');
    await writeFile(fp, JSON.stringify({ hello: 'Hello', extra: 'Extra' }, null, 2) + '\n');

    const applied = await applyFixesToFile(fp, [
      { type: 'delete', locale: 'fr', namespace: 'common', key: 'extra' },
    ]);
    expect(applied).toBe(1);

    const content = await readFile(fp, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.extra).toBeUndefined();
    expect(parsed.hello).toBe('Hello');
  });

  test('applies multiple fixes', async () => {
    const fp = join(tempDir, 'test.json');
    await writeFile(fp, JSON.stringify({ a: '1', b: '2', c: '3' }, null, 2) + '\n');

    const applied = await applyFixesToFile(fp, [
      { type: 'set', locale: 'en', namespace: 'ns', key: 'a', value: 'updated' },
      { type: 'delete', locale: 'en', namespace: 'ns', key: 'c' },
    ]);
    expect(applied).toBe(2);

    const parsed = JSON.parse(await readFile(fp, 'utf-8'));
    expect(parsed.a).toBe('updated');
    expect(parsed.b).toBe('2');
    expect(parsed.c).toBeUndefined();
  });
});

// ─── applyFixes ────────────────────────────────────────────────────────────

describe('applyFixes', () => {
  test('groups fixes by file and applies them', async () => {
    const localesDir = join(tempDir, 'locales');
    await mkdir(join(localesDir, 'fr'), { recursive: true });
    await writeFile(
      join(localesDir, 'fr', 'common.json'),
      JSON.stringify({ hello: 'Bonjour' }, null, 2) + '\n'
    );

    const fixes: FixEntry[] = [
      { type: 'set', locale: 'fr', namespace: 'common', key: 'bye', value: 'Au revoir' },
    ];

    const result = await applyFixes(fixes, localesDir, new Map());
    expect(result.applied).toBe(1);
    expect(result.errors).toEqual([]);

    const parsed = JSON.parse(await readFile(join(localesDir, 'fr', 'common.json'), 'utf-8'));
    expect(parsed.bye).toBe('Au revoir');
  });

  test('collects errors for missing files', async () => {
    const fixes: FixEntry[] = [
      { type: 'set', locale: 'fr', namespace: 'common', key: 'hello', value: 'Bonjour' },
    ];

    const result = await applyFixes(fixes, join(tempDir, 'nonexistent'), new Map());
    expect(result.applied).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('resolves plugin namespace paths', async () => {
    const pluginRoot = join(tempDir, 'my-plugin');
    await mkdir(join(pluginRoot, 'locales', 'en'), { recursive: true });
    await writeFile(
      join(pluginRoot, 'locales', 'en', 'plugin.json'),
      JSON.stringify({ name: 'My Plugin' }, null, 2) + '\n'
    );

    const pathMap = new Map([['my-plugin', pluginRoot]]);
    const fixes: FixEntry[] = [
      { type: 'set', locale: 'en', namespace: 'plugin:my-plugin', key: 'desc', value: 'Description' },
    ];

    const result = await applyFixes(fixes, tempDir, pathMap);
    expect(result.applied).toBe(1);

    const parsed = JSON.parse(
      await readFile(join(pluginRoot, 'locales', 'en', 'plugin.json'), 'utf-8')
    );
    expect(parsed.desc).toBe('Description');
  });
});
