/**
 * Tests for StoreService
 */

import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { useBunMock } from '@brika/testing';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { Logger } from '@/runtime/logs/log-router';
import { LocalRegistry } from '@/runtime/store/sources/local';
import { NpmRegistry } from '@/runtime/store/sources/npm';
import { StoreService } from '@/runtime/store/store-service';
import { VerifiedPluginsService } from '@/runtime/store/verified';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const mockConfig = {
  plugins: [
    {
      name: '@brika/plugin-timer',
      version: 'workspace:*',
    },
  ],
};

const mockConfigEmpty = {
  plugins: [] as Array<{
    name: string;
    version: string;
  }>,
};

const localPkg = {
  name: '@brika/plugin-timer',
  version: '1.0.0',
  main: './src/index.ts',
  displayName: 'Timer',
  description: 'A timer plugin',
  author: 'Test',
  keywords: ['brika', 'timer'],
  engines: {
    brika: '^0.1.0',
  },
};

const npmPkgData = {
  name: '@brika/plugin-weather',
  version: '2.0.0',
  displayName: 'Weather',
  description: 'A weather plugin',
  author: 'Author',
  keywords: ['brika', 'weather'],
  repository: 'https://github.com/brika/weather',
  homepage: 'https://weather.brika.dev',
  license: 'MIT',
  engines: {
    brika: '^0.1.0',
  },
  date: '2024-06-01T00:00:00.000Z',
};

const localSearchResult = {
  package: {
    name: '@brika/plugin-timer',
    version: '1.0.0',
    displayName: 'Timer',
    description: 'A timer plugin',
    author: 'Test',
    keywords: ['brika', 'timer'],
    engines: {
      brika: '^0.1.0',
    },
  },
  downloadCount: 0,
  source: 'local',
  installVersion: 'workspace:*',
};

const npmSearchResult = {
  package: {
    name: '@brika/plugin-weather',
    version: '2.0.0',
    displayName: 'Weather',
    description: 'A weather plugin',
    author: 'Author',
    keywords: ['brika', 'weather'],
    engines: {
      brika: '^0.1.0',
    },
  },
  downloadCount: 500,
  source: 'npm',
  installVersion: '2.0.0',
};

// ─────────────────────────────────────────────────────────────────────────────
// Test setup
// ─────────────────────────────────────────────────────────────────────────────

describe('StoreService', () => {
  const bun = useBunMock();
  let service: StoreService;

  let mockNpm: {
    search: ReturnType<typeof mock>;
    getPackageDetails: ReturnType<typeof mock>;
  };
  let mockLocal: {
    search: ReturnType<typeof mock>;
    findByName: ReturnType<typeof mock>;
  };
  let mockVerified: {
    init: ReturnType<typeof mock>;
    isVerified: ReturnType<typeof mock>;
    getVerifiedPlugin: ReturnType<typeof mock>;
    getVerifiedList: ReturnType<typeof mock>;
  };
  let mockConfigLoader: {
    get: ReturnType<typeof mock>;
    resolvePluginEntry: ReturnType<typeof mock>;
  };

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);

      mockNpm = {
        search: mock().mockResolvedValue({
          plugins: [],
          total: 0,
        }),
        getPackageDetails: mock().mockResolvedValue(null),
      };
      mockLocal = {
        search: mock().mockResolvedValue({
          plugins: [],
          total: 0,
        }),
        findByName: mock().mockResolvedValue(null),
      };
      mockVerified = {
        init: mock().mockResolvedValue(undefined),
        isVerified: mock().mockResolvedValue(false),
        getVerifiedPlugin: mock().mockResolvedValue(null),
        getVerifiedList: mock().mockResolvedValue({
          plugins: [],
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00.000Z',
        }),
      };
      mockConfigLoader = {
        get: mock().mockReturnValue(mockConfig),
        resolvePluginEntry: mock().mockResolvedValue({
          name: '@brika/plugin-timer',
          rootDirectory: '/workspace/plugins/timer',
        }),
      };

      stub(NpmRegistry, mockNpm);
      stub(LocalRegistry, mockLocal);
      stub(VerifiedPluginsService, mockVerified);
      stub(ConfigLoader, mockConfigLoader);

      service = get(StoreService);
    }
  );

  // ─── search ─────────────────────────────────────────────────────────────────

  describe('search', () => {
    test('combines local and npm results with local first', async () => {
      mockLocal.search.mockResolvedValue({
        plugins: [localSearchResult],
        total: 1,
      });
      mockNpm.search.mockResolvedValue({
        plugins: [npmSearchResult],
        total: 1,
      });

      const result = await service.search('timer');

      expect(result.total).toBe(2);
      expect(result.plugins).toHaveLength(2);
      expect(result.plugins[0].package.name).toBe('@brika/plugin-timer');
      expect(result.plugins[1].package.name).toBe('@brika/plugin-weather');
    });

    test('passes query, limit, and offset to npm registry', async () => {
      await service.search('weather', 10, 5);

      expect(mockNpm.search).toHaveBeenCalledWith('weather', 10, 5);
    });

    test('passes query to local registry', async () => {
      await service.search('timer');

      expect(mockLocal.search).toHaveBeenCalledWith('timer');
    });

    test('uses default limit and offset when not provided', async () => {
      await service.search('test');

      expect(mockNpm.search).toHaveBeenCalledWith('test', 20, 0);
    });

    test('returns empty results when both sources return nothing', async () => {
      const result = await service.search('nonexistent');

      expect(result.total).toBe(0);
      expect(result.plugins).toEqual([]);
    });

    test('enriches results with installed status', async () => {
      mockLocal.search.mockResolvedValue({
        plugins: [localSearchResult],
        total: 1,
      });

      const result = await service.search();

      expect(result.plugins[0].installed).toBe(true);
    });

    test('enriches results with compatibility info', async () => {
      mockNpm.search.mockResolvedValue({
        plugins: [npmSearchResult],
        total: 1,
      });
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);

      const result = await service.search();

      expect(result.plugins[0]).toHaveProperty('compatible');
      expect(result.plugins[0].installed).toBe(false);
    });

    test('works with undefined query', async () => {
      const result = await service.search();

      expect(mockNpm.search).toHaveBeenCalledWith(undefined, 20, 0);
      expect(mockLocal.search).toHaveBeenCalledWith(undefined);
      expect(result.total).toBe(0);
    });
  });

  // ─── getPluginDetails ───────────────────────────────────────────────────────

  describe('getPluginDetails', () => {
    test('routes to local only when id has "local:" prefix', async () => {
      mockLocal.findByName.mockResolvedValue({
        rootDir: '/workspace/plugins/timer',
        pkg: localPkg,
      });

      const result = await service.getPluginDetails('local:@brika/plugin-timer');

      expect(result).not.toBeNull();
      expect(result?.source).toBe('local');
      expect(result?.name).toBe('@brika/plugin-timer');
      // Should not have called npm
      expect(mockNpm.getPackageDetails).not.toHaveBeenCalled();
    });

    test('routes to npm only when id has "npm:" prefix', async () => {
      mockNpm.getPackageDetails.mockResolvedValue(npmPkgData);

      const result = await service.getPluginDetails('npm:@brika/plugin-weather');

      expect(result).not.toBeNull();
      expect(result?.source).toBe('npm');
      expect(result?.name).toBe('@brika/plugin-weather');
      // Should not have called local findByName
      expect(mockLocal.findByName).not.toHaveBeenCalled();
    });

    test('tries local first then npm when no prefix', async () => {
      mockLocal.findByName.mockResolvedValue({
        rootDir: '/workspace/plugins/timer',
        pkg: localPkg,
      });

      const result = await service.getPluginDetails('@brika/plugin-timer');

      expect(result).not.toBeNull();
      expect(result?.source).toBe('local');
      // npm should not have been called since local found it
      expect(mockNpm.getPackageDetails).not.toHaveBeenCalled();
    });

    test('falls back to npm when local returns null and no prefix', async () => {
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);
      mockNpm.getPackageDetails.mockResolvedValue(npmPkgData);

      const result = await service.getPluginDetails('@brika/plugin-weather');

      expect(result).not.toBeNull();
      expect(result?.source).toBe('npm');
    });

    test('returns null when neither source has the plugin', async () => {
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);

      const result = await service.getPluginDetails('nonexistent-plugin');

      expect(result).toBeNull();
    });

    // ─── local details (via getPluginDetails) ─────────────────────────

    test('reads workspace package.json for workspace entries', async () => {
      bun
        .fs({
          '/workspace/plugins/timer/package.json': localPkg,
        })
        .apply();

      const result = await service.getPluginDetails('local:@brika/plugin-timer');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('@brika/plugin-timer');
      expect(result?.version).toBe('1.0.0');
      expect(result?.source).toBe('local');
      expect(result?.installVersion).toBe('workspace:*');
      expect(result?.verified).toBe(false);
      expect(result?.featured).toBe(false);
    });

    test('falls back to local registry findByName on workspace resolve error', async () => {
      mockConfigLoader.resolvePluginEntry.mockRejectedValue(new Error('resolve failed'));
      mockLocal.findByName.mockResolvedValue({
        rootDir: '/workspace/plugins/timer',
        pkg: localPkg,
      });

      const result = await service.getPluginDetails('local:@brika/plugin-timer');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('@brika/plugin-timer');
      expect(mockLocal.findByName).toHaveBeenCalledWith('@brika/plugin-timer');
    });

    test('falls back to local registry when Bun.file().json() throws', async () => {
      mockConfigLoader.resolvePluginEntry.mockResolvedValue({
        name: '@brika/plugin-timer',
        rootDirectory: '/bad/path',
      });
      bun.apply(); // no files mocked, so Bun.file().json() will throw
      mockLocal.findByName.mockResolvedValue({
        rootDir: '/workspace/plugins/timer',
        pkg: localPkg,
      });

      const result = await service.getPluginDetails('local:@brika/plugin-timer');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('@brika/plugin-timer');
    });

    test('returns null when local details finds nothing', async () => {
      mockConfigLoader.get.mockReturnValue({
        plugins: [],
      });
      mockLocal.findByName.mockResolvedValue(null);

      const result = await service.getPluginDetails('local:@brika/plugin-timer');

      expect(result).toBeNull();
    });

    test('local details populates all StorePlugin fields', async () => {
      mockLocal.findByName.mockResolvedValue({
        rootDir: '/workspace/plugins/timer',
        pkg: localPkg,
      });
      mockConfigLoader.get.mockReturnValue({
        plugins: [],
      });

      const result = await service.getPluginDetails('local:@brika/plugin-timer');

      expect(result).not.toBeNull();
      expect(result?.description).toBe('A timer plugin');
      expect(result?.author).toBe('Test');
      expect(result?.keywords).toEqual(['brika', 'timer']);
      expect(result?.license).toBeUndefined();
      expect(result?.npm).toEqual({
        downloads: 0,
        publishedAt: '',
      });
      expect(result).toHaveProperty('compatible');
      expect(result).toHaveProperty('installed');
    });

    // ─── npm details (via getPluginDetails) ───────────────────────────

    test('npm details includes verified status when plugin is verified', async () => {
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);
      mockNpm.getPackageDetails.mockResolvedValue(npmPkgData);
      mockVerified.isVerified.mockResolvedValue(true);
      mockVerified.getVerifiedPlugin.mockResolvedValue({
        name: '@brika/plugin-weather',
        verifiedAt: '2024-01-01T00:00:00.000Z',
        verifiedBy: 'admin',
        featured: true,
        category: 'weather',
      });

      const result = await service.getPluginDetails('npm:@brika/plugin-weather');

      expect(result).not.toBeNull();
      expect(result?.verified).toBe(true);
      expect(result?.verifiedAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result?.featured).toBe(true);
    });

    test('npm details marks non-verified plugins correctly', async () => {
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);
      mockNpm.getPackageDetails.mockResolvedValue(npmPkgData);
      mockVerified.isVerified.mockResolvedValue(false);

      const result = await service.getPluginDetails('npm:@brika/plugin-weather');

      expect(result).not.toBeNull();
      expect(result?.verified).toBe(false);
      expect(result?.verifiedAt).toBeUndefined();
      expect(result?.featured).toBe(false);
    });

    test('npm details returns null when package not found', async () => {
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);
      mockNpm.getPackageDetails.mockResolvedValue(null);

      const result = await service.getPluginDetails('npm:@brika/nonexistent');

      expect(result).toBeNull();
    });

    test('npm details calls verified service init before checking', async () => {
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);
      mockNpm.getPackageDetails.mockResolvedValue(npmPkgData);

      await service.getPluginDetails('npm:@brika/plugin-weather');

      expect(mockVerified.init).toHaveBeenCalled();
    });

    test('npm details populates all StorePlugin fields', async () => {
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);
      mockNpm.getPackageDetails.mockResolvedValue(npmPkgData);

      const result = await service.getPluginDetails('npm:@brika/plugin-weather');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('@brika/plugin-weather');
      expect(result?.displayName).toBe('Weather');
      expect(result?.version).toBe('2.0.0');
      expect(result?.description).toBe('A weather plugin');
      expect(result?.author).toBe('Author');
      expect(result?.keywords).toEqual(['brika', 'weather']);
      expect(result?.repository).toBe('https://github.com/brika/weather');
      expect(result?.homepage).toBe('https://weather.brika.dev');
      expect(result?.license).toBe('MIT');
      expect(result?.engines).toEqual({
        brika: '^0.1.0',
      });
      expect(result?.source).toBe('npm');
      expect(result?.installVersion).toBe('2.0.0');
      expect(result?.npm).toEqual({
        downloads: 0,
        publishedAt: '2024-06-01T00:00:00.000Z',
      });
    });

    test('npm details handles missing optional fields with defaults', async () => {
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);
      mockNpm.getPackageDetails.mockResolvedValue({
        name: '@brika/minimal',
        version: '0.1.0',
        engines: {
          brika: '^0.1.0',
        },
      });

      const result = await service.getPluginDetails('npm:@brika/minimal');

      expect(result).not.toBeNull();
      expect(result?.description).toBe('');
      expect(result?.author).toBe('');
      expect(result?.keywords).toEqual([]);
      expect(result?.npm.publishedAt).toBe('');
    });

    test('npm details does not call getVerifiedPlugin when not verified', async () => {
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);
      mockNpm.getPackageDetails.mockResolvedValue(npmPkgData);
      mockVerified.isVerified.mockResolvedValue(false);

      await service.getPluginDetails('npm:@brika/plugin-weather');

      expect(mockVerified.getVerifiedPlugin).not.toHaveBeenCalled();
    });
  });

  // ─── getLocalPluginRoot ─────────────────────────────────────────────────────

  describe('getLocalPluginRoot', () => {
    test('returns rootDirectory for workspace entry', async () => {
      const result = await service.getLocalPluginRoot('@brika/plugin-timer');

      expect(result).toBe('/workspace/plugins/timer');
      expect(mockConfigLoader.resolvePluginEntry).toHaveBeenCalledWith({
        name: '@brika/plugin-timer',
        version: 'workspace:*',
      });
    });

    test('strips source prefix from id', async () => {
      const result = await service.getLocalPluginRoot('local:@brika/plugin-timer');

      expect(result).toBe('/workspace/plugins/timer');
    });

    test('falls back to local registry when resolve fails', async () => {
      mockConfigLoader.resolvePluginEntry.mockRejectedValue(new Error('resolve failed'));
      mockLocal.findByName.mockResolvedValue({
        rootDir: '/fallback/path',
        pkg: localPkg,
      });

      const result = await service.getLocalPluginRoot('@brika/plugin-timer');

      expect(result).toBe('/fallback/path');
    });

    test('falls back to local registry when no workspace entry in config', async () => {
      mockConfigLoader.get.mockReturnValue({
        plugins: [
          {
            name: '@brika/plugin-timer',
            version: '^1.0.0',
          },
        ],
      });
      mockLocal.findByName.mockResolvedValue({
        rootDir: '/discovered/path',
        pkg: localPkg,
      });

      const result = await service.getLocalPluginRoot('@brika/plugin-timer');

      expect(result).toBe('/discovered/path');
    });

    test('returns null when plugin not found in config or local registry', async () => {
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);
      mockLocal.findByName.mockResolvedValue(null);

      const result = await service.getLocalPluginRoot('@brika/plugin-unknown');

      expect(result).toBeNull();
    });

    test('returns null when plugin has non-workspace version and not in local registry', async () => {
      mockConfigLoader.get.mockReturnValue({
        plugins: [
          {
            name: '@brika/plugin-timer',
            version: '^1.0.0',
          },
        ],
      });
      mockLocal.findByName.mockResolvedValue(null);

      const result = await service.getLocalPluginRoot('@brika/plugin-timer');

      expect(result).toBeNull();
    });
  });

  // ─── getVerifiedList ────────────────────────────────────────────────────────

  describe('getVerifiedList', () => {
    test('delegates to verified service', async () => {
      const expectedList = {
        plugins: [
          {
            name: '@brika/verified',
            verifiedAt: '2024-01-01T00:00:00.000Z',
            verifiedBy: 'admin',
          },
        ],
        version: '1.0.0',
        lastUpdated: '2024-01-01T00:00:00.000Z',
      };
      mockVerified.getVerifiedList.mockResolvedValue(expectedList);

      const result = await service.getVerifiedList();

      expect(result).toEqual(expectedList);
      expect(mockVerified.getVerifiedList).toHaveBeenCalledTimes(1);
    });
  });

  // ─── parseId (tested indirectly via public methods) ─────────────────────────

  describe('id parsing', () => {
    test('parses "local:name" prefix correctly', async () => {
      mockConfigLoader.get.mockReturnValue({
        plugins: [],
      });

      await service.getPluginDetails('local:@brika/test');

      // local details path was taken — no npm call
      expect(mockNpm.getPackageDetails).not.toHaveBeenCalled();
    });

    test('parses "npm:name" prefix correctly', async () => {
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);

      await service.getPluginDetails('npm:@brika/test');

      // npm details path was taken
      expect(mockNpm.getPackageDetails).toHaveBeenCalledWith('@brika/test');
    });

    test('handles unprefixed name', async () => {
      mockConfigLoader.get.mockReturnValue({
        plugins: [],
      });
      mockLocal.findByName.mockResolvedValue(null);
      mockNpm.getPackageDetails.mockResolvedValue(null);

      const result = await service.getPluginDetails('@brika/test');

      expect(result).toBeNull();
      // Both sources should have been consulted
      expect(mockNpm.getPackageDetails).toHaveBeenCalledWith('@brika/test');
    });

    test('handles scoped package names with colons in prefix', async () => {
      mockConfigLoader.get.mockReturnValue(mockConfigEmpty);

      await service.getPluginDetails('npm:@scope/plugin-name');

      expect(mockNpm.getPackageDetails).toHaveBeenCalledWith('@scope/plugin-name');
    });
  });
});
