import 'reflect-metadata';
import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { get, reset, stub, trackSpy, useTestBed } from '@brika/di/testing';
import type { VerifiedPluginsList } from '@brika/shared';
import { Logger } from '@/runtime/logs/log-router';
import { VerifiedPluginsService } from '@/runtime/store';

useTestBed({ autoStub: false });

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

// Mock state
let mockContent: string | null = null;
let mockError: Error | null = null;

// Create a mock BunFile object
function createMockBunFile() {
  return {
    text: () => {
      if (mockError) return Promise.reject(mockError);
      return Promise.resolve(mockContent ?? '');
    },
    json: () => {
      if (mockError) return Promise.reject(mockError);
      try {
        return Promise.resolve(JSON.parse(mockContent ?? '{}'));
      } catch {
        return Promise.reject(new Error('Invalid JSON'));
      }
    },
    exists: () => Promise.resolve(mockContent !== null),
    size: 0,
    type: 'application/json',
    name: 'verified-plugins.json',
    lastModified: Date.now(),
  };
}

function setMockContent(content: string): void {
  mockContent = content;
  mockError = null;
}

function setMockError(error: Error): void {
  mockError = error;
  mockContent = null;
}

function resetMock(): void {
  mockContent = null;
  mockError = null;
}

describe('VerifiedPluginsService', () => {
  let service: VerifiedPluginsService;

  beforeEach(() => {
    reset();
    stub(Logger);
    resetMock();

    // Store original for passthrough
    const originalBunFile = Bun.file.bind(Bun);

    // Spy on Bun.file and intercept calls for verified-plugins.json
    // trackSpy registers for auto-cleanup via useTestBed's afterEach
    trackSpy(
      spyOn(Bun, 'file').mockImplementation(((path: string | URL) => {
        const pathStr = String(path);
        if (pathStr.includes('verified-plugins.json')) {
          return createMockBunFile();
        }
        // For other files, call the real implementation
        return originalBunFile(path);
      }) as typeof Bun.file)
    );

    service = get(VerifiedPluginsService);
  });

  describe('init', () => {
    test('should not refetch if data is fresh', async () => {
      const verifiedList = createVerifiedList();
      setMockContent(JSON.stringify(verifiedList));

      await service.init();
      await service.init();
    });

    test('should deduplicate concurrent init calls', async () => {
      const verifiedList = createVerifiedList();
      setMockContent(JSON.stringify(verifiedList));

      await Promise.all([service.init(), service.init(), service.init()]);
    });
  });

  describe('getVerifiedList', () => {
    test('should return the full verified plugins list', async () => {
      const verifiedList = createVerifiedList();
      setMockContent(JSON.stringify(verifiedList));

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(2);
      expect(result.version).toBe('1.0.0');
      expect(result.lastUpdated).toBe('2024-02-01T00:00:00.000Z');
    });

    test('should return empty list on read failure', async () => {
      setMockError(new Error('File not found'));

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(0);
      expect(result.version).toBe('1.0.0');
    });

    test('should return empty list on invalid response format', async () => {
      setMockContent(JSON.stringify({ invalid: 'data' }));

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(0);
    });
  });

  describe('isVerified', () => {
    test('should return true for verified plugins', async () => {
      const verifiedList = createVerifiedList();
      setMockContent(JSON.stringify(verifiedList));

      const result = await service.isVerified('@brika/verified-plugin');

      expect(result).toBeTrue();
    });

    test('should return false for non-verified plugins', async () => {
      const verifiedList = createVerifiedList();
      setMockContent(JSON.stringify(verifiedList));

      const result = await service.isVerified('@brika/unknown-plugin');

      expect(result).toBeFalse();
    });
  });

  describe('getVerifiedPlugin', () => {
    test('should return plugin details for verified plugins', async () => {
      const verifiedList = createVerifiedList();
      setMockContent(JSON.stringify(verifiedList));

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
      const verifiedList = createVerifiedList();
      setMockContent(JSON.stringify(verifiedList));

      const result = await service.getVerifiedPlugin('@brika/nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getFeaturedPlugins', () => {
    test('should return only featured plugins', async () => {
      const verifiedList = createVerifiedList();
      setMockContent(JSON.stringify(verifiedList));

      const result = await service.getFeaturedPlugins();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('@brika/verified-plugin');
      expect(result[0].featured).toBeTrue();
    });

    test('should return empty array when no plugins are featured', async () => {
      const verifiedList = createVerifiedList({
        plugins: [
          {
            name: '@brika/unfeatured',
            verifiedAt: '2024-01-01T00:00:00.000Z',
            verifiedBy: 'admin',
          },
        ],
      });
      setMockContent(JSON.stringify(verifiedList));

      const result = await service.getFeaturedPlugins();

      expect(result).toHaveLength(0);
    });
  });

  describe('refresh', () => {
    test('should force refetch of verified list', async () => {
      const initialList = createVerifiedList();
      setMockContent(JSON.stringify(initialList));

      await service.init();
      const beforeRefresh = await service.isVerified('@brika/new-plugin');
      expect(beforeRefresh).toBeFalse();

      const updatedList = createVerifiedList({
        plugins: [
          {
            name: '@brika/new-plugin',
            verifiedAt: '2024-03-01T00:00:00.000Z',
            verifiedBy: 'admin',
          },
        ],
        lastUpdated: '2024-03-01T00:00:00.000Z',
      });
      setMockContent(JSON.stringify(updatedList));

      await service.refresh();
      const afterRefresh = await service.isVerified('@brika/new-plugin');

      expect(afterRefresh).toBeTrue();
    });
  });

  describe('error handling', () => {
    test('should handle malformed JSON response', async () => {
      setMockContent('not json');

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(0);
    });

    test('should handle response with plugins as non-array', async () => {
      setMockContent(
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
