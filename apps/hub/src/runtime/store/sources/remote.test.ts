import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { HttpClient } from '@brika/http';
import { type BrikaConfig, ConfigLoader } from '@/runtime/config/config-loader';
import type { RegistryDescriptor } from '@/runtime/config/registries';
import { Logger } from '@/runtime/logs/log-router';
import { RemoteRegistrySource } from '@/runtime/store/sources/remote';

useTestBed({ autoStub: false });

/** A minimal `/v1` plugin summary. */
function summary(name: string) {
  return {
    name,
    displayName: name,
    description: 'desc',
    version: '1.0.0',
    brikaEngine: '^0.1.0',
    keywords: ['brika'],
    downloadsWeekly: 5,
  };
}

describe('RemoteRegistrySource', () => {
  let service: RemoteRegistrySource;
  let stores: string[];
  let registries: RegistryDescriptor[];
  let searchByStore: Map<string, { plugins: unknown[]; total: number }>;
  let detailByStore: Map<string, unknown>;
  let readmeByStore: Map<string, unknown>;
  let failSearch: Set<string>;

  beforeEach(() => {
    stub(Logger);
    stores = ['https://a.test', 'https://b.test'];
    registries = [];
    searchByStore = new Map();
    detailByStore = new Map();
    readmeByStore = new Map();
    failSearch = new Set();

    const httpMock = {
      get: mock((url: string) => {
        const base = url.replace(/\/v1\/.*$/, '');
        const data = () => {
          if (url.includes('/v1/search')) {
            if (failSearch.has(base)) {
              return Promise.reject(new Error('store down'));
            }
            return Promise.resolve(searchByStore.get(base) ?? { plugins: [], total: 0 });
          }
          if (url.includes('/readme')) {
            const readme = readmeByStore.get(base);
            return readme ? Promise.resolve(readme) : Promise.reject(new Error('HTTP 404'));
          }
          const detail = detailByStore.get(base);
          return detail ? Promise.resolve(detail) : Promise.reject(new Error('HTTP 404'));
        };
        return {
          params: () => ({ cache: () => ({ data }) }),
          cache: () => ({ data }),
        };
      }),
    };

    stub(HttpClient, httpMock);
    // The source reads the effective store list (getSearchStores) and the registry catalogue
    // (get().registries) for plugin-URL templates; the rest of BrikaConfig is irrelevant here.
    stub(ConfigLoader, {
      get: mock(() => ({ searchStores: stores, registries }) as unknown as BrikaConfig),
      getSearchStores: mock(() => stores),
    });
    service = get(RemoteRegistrySource);
  });

  test('configured reflects whether any store is set', () => {
    expect(service.configured).toBe(true);
    stores = [];
    expect(service.configured).toBe(false);
  });

  test('merges results across stores and de-dupes by name (first store wins)', async () => {
    searchByStore.set('https://a.test', {
      plugins: [summary('@x/one'), summary('@x/dup')],
      total: 2,
    });
    searchByStore.set('https://b.test', {
      plugins: [summary('@x/dup'), summary('@x/two')],
      total: 2,
    });

    const result = await service.search('q');

    expect(result.plugins.map((p) => p.package.name)).toEqual(['@x/one', '@x/dup', '@x/two']);
    expect(result.total).toBe(3);
  });

  test('a single failing store does not sink the federated search', async () => {
    searchByStore.set('https://a.test', { plugins: [summary('@x/one')], total: 1 });
    failSearch.add('https://b.test');

    const result = await service.search();

    expect(result.plugins.map((p) => p.package.name)).toEqual(['@x/one']);
  });

  test('returns empty when no store is configured', async () => {
    stores = [];
    expect(await service.search('q')).toEqual({ plugins: [], total: 0 });
  });

  test('details return the first store that has the package', async () => {
    detailByStore.set('https://b.test', { ...summary('@x/two'), repository: 'https://repo' });

    const detail = await service.getPackageDetails('@x/two');

    expect(detail?.name).toBe('@x/two');
    expect(detail?.repository).toBe('https://repo');
    expect(detail?.engines).toEqual({ brika: '^0.1.0' });
  });

  test('details are null when no store has the package', async () => {
    expect(await service.getPackageDetails('@x/missing')).toBeNull();
  });

  test('getDetailWithStore returns the package plus a default "Open in <store>" link', async () => {
    detailByStore.set('https://b.test', { ...summary('@x/two'), repository: 'https://repo' });

    const found = await service.getDetailWithStore('@x/two');

    expect(found?.pkg.name).toBe('@x/two');
    // No descriptor matches the base, so the link falls back to <base>/<name> with a generic name.
    expect(found?.external).toEqual({ name: 'Store', url: 'https://b.test/@x/two' });
  });

  test('getDetailWithStore is null when no store has the package', async () => {
    expect(await service.getDetailWithStore('@x/missing')).toBeNull();
  });

  test('getDetailWithStore uses the matching registry name + pluginUrl template', async () => {
    detailByStore.set('https://b.test', summary('@x/two'));
    registries = [
      {
        id: 'b',
        name: 'B store',
        pluginUrl: 'https://b.web/plugin/{name}',
        search: { type: 'v1', url: 'https://b.test' },
      },
    ];

    const found = await service.getDetailWithStore('@x/two');

    expect(found?.external).toEqual({ name: 'B store', url: 'https://b.web/plugin/@x/two' });
  });

  test('getReadme returns the README from the first store that serves it', async () => {
    readmeByStore.set('https://b.test', { readme: '# Hello', filename: 'README.md' });

    const result = await service.getReadme('@x/two');

    expect(result).toEqual({ readme: '# Hello', filename: 'README.md' });
  });

  test('getReadme defaults the filename and skips a store with a null README', async () => {
    readmeByStore.set('https://a.test', { readme: null });
    readmeByStore.set('https://b.test', { readme: '# From B' });

    const result = await service.getReadme('@x/two');

    expect(result).toEqual({ readme: '# From B', filename: 'README.md' });
  });

  test('getReadme is null when no store serves it', async () => {
    expect(await service.getReadme('@x/missing')).toBeNull();
  });

  test('getReadme skips a store whose registry sources README from the CDN (readme: unpkg)', async () => {
    readmeByStore.set('https://a.test', { readme: '# From A' });
    registries = [
      {
        id: 'a',
        name: 'A store',
        search: { type: 'v1', url: 'https://a.test' },
        readme: { type: 'unpkg' },
      },
    ];

    // a.test is skipped (readme: unpkg); b.test has no README → overall null, so the route uses the CDN.
    expect(await service.getReadme('@x/two')).toBeNull();
  });

  test('getIconUrl resolves a root-relative iconUrl against the store base', async () => {
    detailByStore.set('https://b.test', {
      ...summary('@x/two'),
      iconUrl: '/v1/plugins/%40x%2Ftwo/v/1.0.0/files/icon.svg',
    });

    const url = await service.getIconUrl('@x/two');

    expect(url).toBe('https://b.test/v1/plugins/%40x%2Ftwo/v/1.0.0/files/icon.svg');
  });

  test('getIconUrl returns an absolute iconUrl unchanged', async () => {
    detailByStore.set('https://a.test', {
      ...summary('@x/one'),
      iconUrl: 'https://cdn.test/icon.png',
    });

    expect(await service.getIconUrl('@x/one')).toBe('https://cdn.test/icon.png');
  });

  test('getIconUrl skips a store whose registry sources assets from the CDN (readme: unpkg)', async () => {
    detailByStore.set('https://a.test', {
      ...summary('@x/one'),
      iconUrl: 'https://a.cdn/icon.png',
    });
    registries = [
      {
        id: 'a',
        name: 'A store',
        search: { type: 'v1', url: 'https://a.test' },
        readme: { type: 'unpkg' },
      },
    ];

    // a.test is skipped; b.test has no icon → null, so the route falls back to the CDN.
    expect(await service.getIconUrl('@x/one')).toBeNull();
  });

  test('getIconUrl is null when no store carries an icon', async () => {
    detailByStore.set('https://a.test', summary('@x/one'));

    expect(await service.getIconUrl('@x/one')).toBeNull();
  });
});
