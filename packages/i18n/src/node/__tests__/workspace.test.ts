import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { discoverPackageLocales, findWorkspaceRoot } from '../workspace';

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
