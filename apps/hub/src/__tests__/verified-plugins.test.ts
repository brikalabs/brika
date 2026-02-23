import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { get, reset, stub } from '@brika/di/testing';
import type { VerifiedPluginsList } from '@brika/registry';
import { Logger } from '@/runtime/logs/log-router';
import { VerifiedPluginsService } from '@/runtime/store';

const createVerifiedList = (overrides: Partial<VerifiedPluginsList> = {}): VerifiedPluginsList => ({
  plugins: [
    {
      name: '@brika/verified-plugin',
      verifiedAt: '2024-01-01T00:00:00.000Z',
      verifiedBy: 'admin',
      featured: true,
      category: 'automation',
    },
    {
      name: '@brika/another-plugin',
      verifiedAt: '2024-02-01T00:00:00.000Z',
      verifiedBy: 'admin',
      minVersion: '1.0.0',
    },
  ],
  version: '1.0.0',
  lastUpdated: '2024-02-01T00:00:00.000Z',
  ...overrides,
});

// Mock fetch response
let mockResponse: { ok: boolean; status: number; body: string } | null = null;
let mockError: Error | null = null;
let fetchSpy: ReturnType<typeof spyOn>;

function setMockResponse(body: string, ok = true, status = 200): void {
  mockResponse = { ok, status, body };
  mockError = null;
}

function setMockError(error: Error): void {
  mockError = error;
  mockResponse = null;
}

function resetMock(): void {
  mockResponse = null;
  mockError = null;
}

describe('VerifiedPluginsService', () => {
  let service: VerifiedPluginsService;

  beforeEach(() => {
    reset();
    stub(Logger);
    resetMock();

    const originalFetch = globalThis.fetch;
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('verified-plugins.json')) {
        if (mockError) return Promise.reject(mockError);
        return Promise.resolve(
          new Response(mockResponse?.body ?? '', {
            status: mockResponse?.status ?? 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      return originalFetch(input, init);
    }) as typeof fetch);

    service = get(VerifiedPluginsService);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('init', () => {
    test('should not refetch if data is fresh', async () => {
      setMockResponse(JSON.stringify(createVerifiedList()));

      await service.init();
      await service.init();
    });

    test('should deduplicate concurrent init calls', async () => {
      setMockResponse(JSON.stringify(createVerifiedList()));

      await Promise.all([service.init(), service.init(), service.init()]);
    });
  });

  describe('getVerifiedList', () => {
    test('should return the full verified plugins list', async () => {
      setMockResponse(JSON.stringify(createVerifiedList()));

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(2);
      expect(result.version).toBe('1.0.0');
      expect(result.lastUpdated).toBe('2024-02-01T00:00:00.000Z');
    });

    test('should return empty list on fetch failure', async () => {
      setMockError(new Error('Network error'));

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(0);
      expect(result.version).toBe('1.0.0');
    });

    test('should return empty list on non-ok response', async () => {
      setMockResponse('Internal Server Error', false, 500);

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(0);
    });

    test('should return empty list on invalid response format', async () => {
      setMockResponse(JSON.stringify({ invalid: 'data' }));

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(0);
    });
  });

  describe('isVerified', () => {
    test('should return true for verified plugins', async () => {
      setMockResponse(JSON.stringify(createVerifiedList()));

      const result = await service.isVerified('@brika/verified-plugin');

      expect(result).toBeTrue();
    });

    test('should return false for non-verified plugins', async () => {
      setMockResponse(JSON.stringify(createVerifiedList()));

      const result = await service.isVerified('@brika/unknown-plugin');

      expect(result).toBeFalse();
    });
  });

  describe('getVerifiedPlugin', () => {
    test('should return plugin details for verified plugins', async () => {
      setMockResponse(JSON.stringify(createVerifiedList()));

      const result = await service.getVerifiedPlugin('@brika/verified-plugin');

      expect(result).toMatchObject({
        name: '@brika/verified-plugin',
        verifiedAt: '2024-01-01T00:00:00.000Z',
        verifiedBy: 'admin',
        featured: true,
        category: 'automation',
      });
    });

    test('should return null for non-verified plugins', async () => {
      setMockResponse(JSON.stringify(createVerifiedList()));

      const result = await service.getVerifiedPlugin('@brika/nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getFeaturedPlugins', () => {
    test('should return only featured plugins', async () => {
      setMockResponse(JSON.stringify(createVerifiedList()));

      const result = await service.getFeaturedPlugins();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('@brika/verified-plugin');
      expect(result[0].featured).toBeTrue();
    });

    test('should return empty array when no plugins are featured', async () => {
      setMockResponse(
        JSON.stringify(
          createVerifiedList({
            plugins: [
              {
                name: '@brika/unfeatured',
                verifiedAt: '2024-01-01T00:00:00.000Z',
                verifiedBy: 'admin',
              },
            ],
          })
        )
      );

      const result = await service.getFeaturedPlugins();

      expect(result).toHaveLength(0);
    });
  });

  describe('refresh', () => {
    test('should force refetch of verified list', async () => {
      setMockResponse(JSON.stringify(createVerifiedList()));

      await service.init();
      const beforeRefresh = await service.isVerified('@brika/new-plugin');
      expect(beforeRefresh).toBeFalse();

      setMockResponse(
        JSON.stringify(
          createVerifiedList({
            plugins: [
              {
                name: '@brika/new-plugin',
                verifiedAt: '2024-03-01T00:00:00.000Z',
                verifiedBy: 'admin',
              },
            ],
            lastUpdated: '2024-03-01T00:00:00.000Z',
          })
        )
      );

      await service.refresh();
      const afterRefresh = await service.isVerified('@brika/new-plugin');

      expect(afterRefresh).toBeTrue();
    });
  });

  describe('error handling', () => {
    test('should handle malformed JSON response', async () => {
      setMockResponse('not json');

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(0);
    });

    test('should handle response with plugins as non-array', async () => {
      setMockResponse(
        JSON.stringify({
          plugins: 'not an array',
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00.000Z',
        })
      );

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(0);
    });
  });
});
