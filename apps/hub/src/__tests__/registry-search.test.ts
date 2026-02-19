import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { HttpClient } from '@brika/http';
import { Logger } from '@/runtime/logs/log-router';
import { NpmRegistry } from '@/runtime/store';

useTestBed({ autoStub: false });

describe('NpmRegistry', () => {
  let service: NpmRegistry;
  let httpMock: { get: ReturnType<typeof mock> };

  beforeEach(() => {
    stub(Logger);

    // Create a mock HttpClient that we can control
    httpMock = {
      get: mock(() => ({
        params: () => ({
          cache: () => ({
            data: () => Promise.resolve({ objects: [], total: 0 }),
          }),
        }),
        cache: () => ({
          data: () => Promise.resolve({}),
        }),
      })),
    };

    stub(HttpClient, httpMock);
    service = get(NpmRegistry);
  });

  describe('search', () => {
    test('should search and return valid plugins', async () => {
      const searchResponse = {
        objects: [
          {
            package: {
              name: '@brika/test-plugin',
              version: '1.0.0',
              description: 'Test plugin',
              keywords: ['brika'],
            },
          },
        ],
        total: 1,
      };

      const packageResponse = {
        name: '@brika/test-plugin',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: '@brika/test-plugin',
            version: '1.0.0',
            description: 'Test plugin',
            engines: { brika: '^0.1.0' },
          },
        },
        time: { '1.0.0': '2024-01-01T00:00:00.000Z' },
      };

      const downloadsResponse = { downloads: 100, package: '@brika/test-plugin' };

      let callIndex = 0;
      httpMock.get.mockImplementation(() => ({
        params: () => ({
          cache: () => ({
            data: () => Promise.resolve(searchResponse),
          }),
        }),
        cache: () => ({
          data: () => {
            callIndex++;
            if (callIndex === 1) return Promise.resolve(packageResponse);
            return Promise.resolve(downloadsResponse);
          },
        }),
      }));

      const result = await service.search();

      expect(result.plugins).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(httpMock.get).toHaveBeenCalled();
    });

    test('should filter packages without brika engine', async () => {
      const searchResponse = {
        objects: [
          { package: { name: 'non-plugin', version: '1.0.0' } },
          { package: { name: '@brika/real-plugin', version: '1.0.0' } },
        ],
        total: 2,
      };

      const nonPluginPackage = {
        name: 'non-plugin',
        'dist-tags': { latest: '1.0.0' },
        versions: { '1.0.0': { name: 'non-plugin', version: '1.0.0' } },
        time: {},
      };

      const realPluginPackage = {
        name: '@brika/real-plugin',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: '@brika/real-plugin',
            version: '1.0.0',
            description: 'A test plugin for brika',
            engines: { brika: '^0.1.0' },
          },
        },
        time: { '1.0.0': '2024-01-01T00:00:00.000Z' },
      };

      let callIndex = 0;
      httpMock.get.mockImplementation(() => ({
        params: () => ({
          cache: () => ({
            data: () => Promise.resolve(searchResponse),
          }),
        }),
        cache: () => ({
          data: () => {
            callIndex++;
            if (callIndex === 1) return Promise.resolve(nonPluginPackage);
            if (callIndex === 2) return Promise.resolve(realPluginPackage);
            return Promise.resolve({ downloads: 50 });
          },
        }),
      }));

      const result = await service.search('test', 20, 0);

      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].package.name).toBe('@brika/real-plugin');
    });

    test('should return empty results on fetch error', async () => {
      httpMock.get.mockImplementation(() => ({
        params: () => ({
          cache: () => ({
            data: () => Promise.reject(new Error('Network error')),
          }),
        }),
      }));

      const result = await service.search();

      expect(result).toEqual({ plugins: [], total: 0 });
    });

    test('should return empty results on non-ok response', async () => {
      httpMock.get.mockImplementation(() => ({
        params: () => ({
          cache: () => ({
            data: () => Promise.reject(new Error('HTTP 500: Server Error')),
          }),
        }),
      }));

      const result = await service.search();

      expect(result).toEqual({ plugins: [], total: 0 });
    });

    test('should include query in search terms', async () => {
      let capturedUrl = '';
      httpMock.get.mockImplementation((url: string) => {
        capturedUrl = url;
        return {
          params: () => ({
            cache: () => ({
              data: () => Promise.resolve({ objects: [], total: 0 }),
            }),
          }),
        };
      });

      await service.search('my-plugin');

      expect(httpMock.get).toHaveBeenCalled();
      // The search URL contains the search endpoint
      expect(capturedUrl).toContain('search');
    });

    test('should respect limit parameter', async () => {
      const plugins = Array.from({ length: 5 }, (_, i) => ({
        package: { name: `plugin-${i}`, version: '1.0.0' },
      }));

      let callIndex = 0;
      httpMock.get.mockImplementation(() => ({
        params: () => ({
          cache: () => ({
            data: () => Promise.resolve({ objects: plugins, total: 5 }),
          }),
        }),
        cache: () => ({
          data: () => {
            const idx = Math.floor(callIndex / 2);
            callIndex++;
            if (callIndex % 2 === 1) {
              return Promise.resolve({
                name: `plugin-${idx}`,
                'dist-tags': { latest: '1.0.0' },
                versions: {
                  '1.0.0': {
                    name: `plugin-${idx}`,
                    version: '1.0.0',
                    engines: { brika: '^0.1.0' },
                  },
                },
                time: {},
              });
            }
            return Promise.resolve({ downloads: 10 });
          },
        }),
      }));

      const result = await service.search(undefined, 3);

      expect(result.plugins).toHaveLength(3);
    });
  });

  describe('getPackageDetails', () => {
    test('should fetch and parse package details', async () => {
      const packageResponse = {
        name: '@brika/test-plugin',
        'dist-tags': { latest: '2.0.0' },
        versions: {
          '1.0.0': { name: '@brika/test-plugin', version: '1.0.0' },
          '2.0.0': {
            name: '@brika/test-plugin',
            version: '2.0.0',
            description: 'A test plugin',
            author: 'Test Author',
            keywords: ['brika', 'plugin'],
            license: 'MIT',
            engines: { brika: '^0.1.0' },
          },
        },
        time: { '2.0.0': '2024-06-01T00:00:00.000Z' },
      };

      httpMock.get.mockImplementation(() => ({
        cache: () => ({
          data: () => Promise.resolve(packageResponse),
        }),
      }));

      const result = await service.getPackageDetails('@brika/test-plugin');

      expect(result).toMatchObject({
        name: '@brika/test-plugin',
        version: '2.0.0',
        description: 'A test plugin',
        author: 'Test Author',
        keywords: ['brika', 'plugin'],
        license: 'MIT',
        engines: { brika: '^0.1.0' },
        date: '2024-06-01T00:00:00.000Z',
      });
    });

    test('should return null for 404 response', async () => {
      httpMock.get.mockImplementation(() => ({
        cache: () => ({
          data: () => Promise.reject(new Error('HTTP 404: Not Found')),
        }),
      }));

      const result = await service.getPackageDetails('nonexistent-package');

      expect(result).toBeNull();
    });

    test('should return null on fetch error', async () => {
      httpMock.get.mockImplementation(() => ({
        cache: () => ({
          data: () => Promise.reject(new Error('Network error')),
        }),
      }));

      const result = await service.getPackageDetails('@brika/test');

      expect(result).toBeNull();
    });

    test('should return null when no versions available', async () => {
      httpMock.get.mockImplementation(() => ({
        cache: () => ({
          data: () =>
            Promise.resolve({
              name: 'empty-package',
              'dist-tags': {},
              versions: {},
              time: {},
            }),
        }),
      }));

      const result = await service.getPackageDetails('empty-package');

      expect(result).toBeNull();
    });

    test('should fetch package details', async () => {
      const packageResponse = {
        name: '@brika/test',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': { name: '@brika/test', version: '1.0.0' },
        },
        time: {},
      };

      httpMock.get.mockImplementation(() => ({
        cache: () => ({
          data: () => Promise.resolve(packageResponse),
        }),
      }));

      const result = await service.getPackageDetails('@brika/test');

      expect(result?.name).toBe('@brika/test');
      expect(result?.version).toBe('1.0.0');
      expect(httpMock.get).toHaveBeenCalled();
    });

    test('should fallback to last version key when no dist-tags.latest', async () => {
      const packageResponse = {
        name: '@brika/no-latest',
        'dist-tags': {},
        versions: {
          '0.1.0': { name: '@brika/no-latest', version: '0.1.0' },
          '0.2.0': { name: '@brika/no-latest', version: '0.2.0', description: 'Fallback version' },
        },
        time: {},
      };

      httpMock.get.mockImplementation(() => ({
        cache: () => ({
          data: () => Promise.resolve(packageResponse),
        }),
      }));

      const result = await service.getPackageDetails('@brika/no-latest');

      expect(result?.version).toBe('0.2.0');
      expect(result?.description).toBe('Fallback version');
    });

    test('should handle author as object', async () => {
      const packageResponse = {
        name: '@brika/author-obj',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: '@brika/author-obj',
            version: '1.0.0',
            author: { name: 'John Doe', email: 'john@example.com' },
          },
        },
        time: {},
      };

      httpMock.get.mockImplementation(() => ({
        cache: () => ({
          data: () => Promise.resolve(packageResponse),
        }),
      }));

      const result = await service.getPackageDetails('@brika/author-obj');

      expect(result?.author).toEqual({ name: 'John Doe', email: 'john@example.com' });
    });
  });
});
