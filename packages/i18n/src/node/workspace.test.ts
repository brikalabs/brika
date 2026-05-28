import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { discoverNamespacedSources, discoverPackageLocales, findWorkspaceRoot } from './workspace';

const bun = useBunMock();

describe('findWorkspaceRoot', () => {
  test('returns the directory containing a package.json with workspaces', async () => {
    bun
      .fs({
        '/repo/package.json': { workspaces: ['packages/*'] },
        '/repo/apps/hub/package.json': { name: '@brika/hub' },
      })
      .apply();

    expect(await findWorkspaceRoot('/repo/apps/hub')).toBe('/repo');
  });

  test('walks up multiple levels', async () => {
    bun
      .fs({
        '/repo/package.json': { workspaces: ['packages/*'] },
        '/repo/apps/hub/inner/package.json': { name: 'inner' },
      })
      .apply();

    expect(await findWorkspaceRoot('/repo/apps/hub/inner')).toBe('/repo');
  });

  test('returns undefined when no workspaces field found', async () => {
    bun
      .fs({
        '/repo/package.json': { name: 'app' },
      })
      .apply();

    expect(await findWorkspaceRoot('/repo')).toBeUndefined();
  });

  test('returns undefined for paths outside any workspace', async () => {
    bun.fs({}).apply();

    expect(await findWorkspaceRoot('/no/workspace/here')).toBeUndefined();
  });
});

describe('discoverPackageLocales', () => {
  test('yields one entry per package with locales, namespace from package.json name', async () => {
    bun
      .fs({
        '/repo/packages/permissions/package.json': { name: '@brika/permissions' },
        '/repo/packages/permissions/locales/en/permissions.json': { hello: 'Hello' },
        '/repo/packages/permissions/locales/fr/permissions.json': { hello: 'Bonjour' },
      })
      .apply();

    const entries = await discoverPackageLocales('/repo');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.namespace).toBe('permissions');
    expect(entries[0]?.locales.get('en')).toEqual({ hello: 'Hello' });
    expect(entries[0]?.locales.get('fr')).toEqual({ hello: 'Bonjour' });
  });

  test('skips packages without a locales/ directory', async () => {
    bun
      .fs({
        '/repo/packages/with-locales/package.json': { name: '@brika/with-locales' },
        '/repo/packages/with-locales/locales/en/strings.json': { key: 'value' },
        '/repo/packages/no-locales/package.json': { name: '@brika/no-locales' },
      })
      .apply();

    const entries = await discoverPackageLocales('/repo');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.namespace).toBe('with-locales');
  });

  test('strips any scope prefix from the package name', async () => {
    bun
      .fs({
        '/repo/packages/foo/package.json': { name: '@vendor/foo' },
        '/repo/packages/foo/locales/en/foo.json': { ok: 'ok' },
      })
      .apply();

    const entries = await discoverPackageLocales('/repo');

    expect(entries[0]?.namespace).toBe('foo');
  });

  test('falls back to directory name when package.json is missing or malformed', async () => {
    bun
      .fs({
        '/repo/packages/foo/locales/en/foo.json': { ok: 'ok' },
      })
      .apply();

    const entries = await discoverPackageLocales('/repo');

    expect(entries[0]?.namespace).toBe('foo');
  });

  test('merges multiple JSON files in a locale directory flatly', async () => {
    bun
      .fs({
        '/repo/packages/foo/package.json': { name: '@brika/foo' },
        '/repo/packages/foo/locales/en/a.json': { a: 1 },
        '/repo/packages/foo/locales/en/b.json': { b: 2 },
      })
      .apply();

    const entries = await discoverPackageLocales('/repo');

    expect(entries[0]?.locales.get('en')).toEqual({ a: 1, b: 2 });
  });

  test('returns empty array when packages/ is missing', async () => {
    bun.fs({}).apply();

    const entries = await discoverPackageLocales('/repo');

    expect(entries).toEqual([]);
  });
});

describe('discoverNamespacedSources', () => {
  test('enumerates subdirectories that ship a locales/ folder', async () => {
    bun
      .fs({
        '/repo/plugins/weather/package.json': { name: '@brika/plugin-weather' },
        '/repo/plugins/weather/locales/en/strings.json': { ok: 'OK' },
        '/repo/plugins/timer/package.json': { name: '@brika/plugin-timer' },
        '/repo/plugins/timer/locales/en/strings.json': { ok: 'OK' },
      })
      .apply();

    const sources = await discoverNamespacedSources('/repo/plugins');

    expect(sources).toHaveLength(2);
    expect(sources.map((s) => s.namespace).sort((a, b) => a.localeCompare(b))).toEqual([
      'plugin-timer',
      'plugin-weather',
    ]);
  });

  test('skips subdirectories without locales/', async () => {
    bun
      .fs({
        '/repo/plugins/with/package.json': { name: 'with' },
        '/repo/plugins/with/locales/en/x.json': { ok: 'OK' },
        '/repo/plugins/without/package.json': { name: 'without' },
      })
      .apply();

    const sources = await discoverNamespacedSources('/repo/plugins');

    expect(sources).toHaveLength(1);
    expect(sources[0]?.namespace).toBe('with');
  });

  test('transformNamespace callback shapes the final namespace', async () => {
    bun
      .fs({
        '/repo/plugins/weather/package.json': { name: '@brika/plugin-weather' },
        '/repo/plugins/weather/locales/en/strings.json': { ok: 'OK' },
      })
      .apply();

    const sources = await discoverNamespacedSources('/repo/plugins', {
      transformNamespace: (name) => `plugin:${name}`,
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]?.namespace).toBe('plugin:@brika/plugin-weather');
    expect(sources[0]?.dir).toBe('/repo/plugins/weather');
  });

  test('falls back to the directory basename when package.json is missing', async () => {
    bun
      .fs({
        '/repo/plugins/standalone/locales/en/strings.json': { ok: 'OK' },
      })
      .apply();

    const sources = await discoverNamespacedSources('/repo/plugins');

    expect(sources).toHaveLength(1);
    expect(sources[0]?.namespace).toBe('standalone');
  });

  test('returns empty array when the parent directory does not exist', async () => {
    bun.fs({}).apply();

    const sources = await discoverNamespacedSources('/repo/nothing-here');

    expect(sources).toEqual([]);
  });

  test('result is sorted by namespace ascending', async () => {
    bun
      .fs({
        '/repo/plugins/zebra/package.json': { name: 'zebra' },
        '/repo/plugins/zebra/locales/en/x.json': { ok: 'OK' },
        '/repo/plugins/alpha/package.json': { name: 'alpha' },
        '/repo/plugins/alpha/locales/en/x.json': { ok: 'OK' },
        '/repo/plugins/middle/package.json': { name: 'middle' },
        '/repo/plugins/middle/locales/en/x.json': { ok: 'OK' },
      })
      .apply();

    const sources = await discoverNamespacedSources('/repo/plugins');

    expect(sources.map((s) => s.namespace)).toEqual(['alpha', 'middle', 'zebra']);
  });
});
