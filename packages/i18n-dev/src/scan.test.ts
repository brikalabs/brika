import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { scanLocaleDirectory, scanPluginLocales } from './scan';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'i18n-scan-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeJson(path: string, data: unknown) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(data));
}

// ─── scanLocaleDirectory ───────────────────────────────────────────────────

describe('scanLocaleDirectory', () => {
  test('scans locale directories with namespace JSON files', async () => {
    await writeJson(join(tempDir, 'en/common.json'), { hello: 'Hello' });
    await writeJson(join(tempDir, 'en/auth.json'), { login: 'Login' });
    await writeJson(join(tempDir, 'fr/common.json'), { hello: 'Bonjour' });

    const result = await scanLocaleDirectory(tempDir);

    expect(result.size).toBe(2);

    const en = result.get('en');
    expect(en?.size).toBe(2);
    expect(en?.get('common')).toEqual({ hello: 'Hello' });
    expect(en?.get('auth')).toEqual({ login: 'Login' });

    const fr = result.get('fr');
    expect(fr?.size).toBe(1);
    expect(fr?.get('common')).toEqual({ hello: 'Bonjour' });
  });

  test('returns empty map for non-existent directory', async () => {
    const result = await scanLocaleDirectory(join(tempDir, 'nonexistent'));
    expect(result.size).toBe(0);
  });

  test('ignores non-json files', async () => {
    await writeJson(join(tempDir, 'en/common.json'), { hello: 'Hello' });
    await writeFile(join(tempDir, 'en/readme.txt'), 'not json');

    const result = await scanLocaleDirectory(tempDir);
    const en = result.get('en');
    expect(en?.size).toBe(1);
    expect(en?.has('common')).toBe(true);
  });
});

// ─── scanPluginLocales ─────────────────────────────────────────────────────

describe('scanPluginLocales', () => {
  test('scans plugin locale directories', async () => {
    const pluginDir = join(tempDir, 'my-plugin');
    await writeJson(join(pluginDir, 'locales/en/plugin.json'), { name: 'My Plugin' });
    await writeJson(join(pluginDir, 'locales/fr/plugin.json'), { name: 'Mon Plugin' });

    const result = await scanPluginLocales([pluginDir]);

    expect(result).toHaveLength(1);
    const plugin = result[0];
    expect(plugin.rootDir).toBe(pluginDir);
    expect(plugin.packageName).toBe('my-plugin'); // no package.json → falls back to dir name

    const en = plugin.locales.get('en');
    expect(en?.get('plugin')).toEqual({ name: 'My Plugin' });

    const fr = plugin.locales.get('fr');
    expect(fr?.get('plugin')).toEqual({ name: 'Mon Plugin' });
  });

  test('reads package name from package.json', async () => {
    const pluginDir = join(tempDir, 'my-plugin');
    await writeJson(join(pluginDir, 'package.json'), { name: '@scope/my-plugin' });
    await writeJson(join(pluginDir, 'locales/en/plugin.json'), { hello: 'Hello' });

    const result = await scanPluginLocales([pluginDir]);
    expect(result[0].packageName).toBe('@scope/my-plugin');
    expect(result[0].rootDir).toBe(pluginDir);
  });

  test('merges multiple JSON files per locale into single namespace', async () => {
    const pluginDir = join(tempDir, 'my-plugin');
    await writeJson(join(pluginDir, 'locales/en/a.json'), { foo: 'Foo' });
    await writeJson(join(pluginDir, 'locales/en/b.json'), { bar: 'Bar' });

    const result = await scanPluginLocales([pluginDir]);
    const en = result[0].locales.get('en');
    const pluginData = en?.get('plugin');
    expect(pluginData).toHaveProperty('foo', 'Foo');
    expect(pluginData).toHaveProperty('bar', 'Bar');
  });

  test('returns empty array when plugin has no locales', async () => {
    const pluginDir = join(tempDir, 'empty-plugin');
    await mkdir(pluginDir, { recursive: true });
    const result = await scanPluginLocales([pluginDir]);
    expect(result).toHaveLength(0);
  });

  test('handles empty input array', async () => {
    const result = await scanPluginLocales([]);
    expect(result).toHaveLength(0);
  });
});
