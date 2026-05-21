import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import { useBunMock } from '@brika/testing';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { I18nService } from '@/runtime/i18n/i18n-service';
import { Logger } from '@/runtime/logs/log-router';

useTestBed({
  autoStub: false,
});
const bun = useBunMock();

describe('I18nService — workspace package discovery', () => {
  let service: I18nService;
  let mockConfigLoader: {
    getRootDir: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockConfigLoader = {
      getRootDir: mock().mockReturnValue('/repo/apps/hub'),
    };

    stub(Logger);
    provide(ConfigLoader, mockConfigLoader);
    service = get(I18nService);
  });

  test('exposes a namespace per @brika/<X> package with locales/', async () => {
    bun
      .fs({
        '/repo/package.json': { workspaces: ['apps/*', 'packages/*'] },
        '/repo/packages/permissions/package.json': { name: '@brika/permissions' },
        '/repo/packages/permissions/locales/en/permissions.json': {
          title: 'Permissions',
          location: 'Location',
        },
        '/repo/packages/permissions/locales/fr/permissions.json': {
          title: 'Permissions',
          location: 'Localisation',
        },
        '/repo/apps/hub/locales/en/common.json': { hello: 'Hi' },
      })
      .apply();

    await service.init();

    expect(service.listNamespaces()).toContain('permissions');
    expect(service.getNamespaceTranslations('en', 'permissions')).toEqual({
      title: 'Permissions',
      location: 'Location',
    });
    expect(service.getNamespaceTranslations('fr', 'permissions')).toEqual({
      title: 'Permissions',
      location: 'Localisation',
    });
  });

  test('fr-CH falls back to fr then en for workspace package namespaces', async () => {
    bun
      .fs({
        '/repo/package.json': { workspaces: ['apps/*', 'packages/*'] },
        '/repo/packages/foo/package.json': { name: '@brika/foo' },
        '/repo/packages/foo/locales/en/foo.json': {
          a: 'en-a',
          b: 'en-b',
          c: 'en-c',
        },
        '/repo/packages/foo/locales/fr/foo.json': {
          a: 'fr-a',
          b: 'fr-b',
        },
        '/repo/apps/hub/locales/en/common.json': {},
      })
      .apply();

    await service.init();

    expect(service.getNamespaceTranslations('fr-CH', 'foo')).toEqual({
      a: 'fr-a',
      b: 'fr-b',
      c: 'en-c',
    });
  });

  test('workspace package locales are reported by listLocales()', async () => {
    bun
      .fs({
        '/repo/package.json': { workspaces: ['packages/*'] },
        '/repo/packages/foo/package.json': { name: '@brika/foo' },
        '/repo/packages/foo/locales/de/foo.json': { hello: 'Hallo' },
        '/repo/apps/hub/locales/en/common.json': {},
      })
      .apply();

    await service.init();

    expect(service.listLocales()).toContain('de');
  });

  test('workspace data merges with core when they share a namespace; workspace wins', async () => {
    bun
      .fs({
        '/repo/package.json': { workspaces: ['packages/*'] },
        '/repo/packages/shared/package.json': { name: '@brika/shared' },
        '/repo/packages/shared/locales/en/shared.json': { fromPackage: 'pkg', shared: 'pkg' },
        '/repo/apps/hub/locales/en/shared.json': { fromHub: 'hub', shared: 'hub' },
      })
      .apply();

    await service.init();

    expect(service.getNamespaceTranslations('en', 'shared')).toEqual({
      fromHub: 'hub',
      fromPackage: 'pkg',
      shared: 'pkg',
    });
  });

  test('getAllTranslations includes workspace package namespaces', async () => {
    bun
      .fs({
        '/repo/package.json': { workspaces: ['packages/*'] },
        '/repo/packages/permissions/package.json': { name: '@brika/permissions' },
        '/repo/packages/permissions/locales/en/permissions.json': { title: 'Permissions' },
        '/repo/apps/hub/locales/en/common.json': { hello: 'Hi' },
      })
      .apply();

    await service.init();

    const all = service.getAllTranslations('en');
    expect(all.common).toEqual({ hello: 'Hi' });
    expect(all.permissions).toEqual({ title: 'Permissions' });
  });
});

describe('I18nService — embedded workspace archive', () => {
  let service: I18nService;
  let mockConfigLoader: {
    getRootDir: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockConfigLoader = {
      getRootDir: mock().mockReturnValue('/test/hub'),
    };

    stub(Logger);
    provide(ConfigLoader, mockConfigLoader);
    service = get(I18nService);
  });

  test('falls back to embedded workspace archive when no workspace root is reachable', async () => {
    // No bun.fs apply — real Bun.Glob handles missing /test/hub/locales (triggers
    // embedded core archive) and findWorkspaceRoot walks the real filesystem upward,
    // returning undefined since /test/hub doesn't exist. The embedded workspace
    // archive (built from packages/*/locales at compile time) covers permissions.
    await service.init();

    const namespaces = service.listNamespaces();
    expect(namespaces).toContain('permissions');

    const permissions = service.getNamespaceTranslations('en', 'permissions');
    expect(permissions?.location).toBe('Location');
    expect(permissions?.title).toBe('Permissions');
  });
});
