import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, reset, stub, useTestBed } from '@brika/di/testing';
import type { VerifiedPluginsList } from '@brika/shared';
import { Logger } from '@/runtime/logs/log-router';
import { VerifiedPluginsService } from '@/runtime/services/verified-plugins';

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

// Mock the fs module using bun's mock.module
const mockReadFile = mock<(path: string, encoding: string) => Promise<string>>(() =>
  Promise.resolve('')
);

mock.module('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

describe('VerifiedPluginsService', () => {
  let service: VerifiedPluginsService;

  beforeEach(() => {
    reset();
    stub(Logger);
    mockReadFile.mockReset();
    service = get(VerifiedPluginsService);
  });

  reset();

  describe('init', () => {
    test('should not refetch if data is fresh', async () => {
      const verifiedList = createVerifiedList();
      mockReadFile.mockResolvedValue(JSON.stringify(verifiedList));

      await service.init();
      await service.init();

      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    test('should deduplicate concurrent init calls', async () => {
      const verifiedList = createVerifiedList();
      mockReadFile.mockResolvedValue(JSON.stringify(verifiedList));

      await Promise.all([service.init(), service.init(), service.init()]);

      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('getVerifiedList', () => {
    test('should return the full verified plugins list', async () => {
      const verifiedList = createVerifiedList();
      mockReadFile.mockResolvedValue(JSON.stringify(verifiedList));

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(2);
      expect(result.version).toBe('1.0.0');
      expect(result.lastUpdated).toBe('2024-02-01T00:00:00.000Z');
    });

    test('should return empty list on read failure', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(0);
      expect(result.version).toBe('1.0.0');
    });

    test('should return empty list on invalid response format', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ invalid: 'data' }));

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(0);
    });
  });

  describe('isVerified', () => {
    test('should return true for verified plugins', async () => {
      const verifiedList = createVerifiedList();
      mockReadFile.mockResolvedValue(JSON.stringify(verifiedList));

      const result = await service.isVerified('@brika/verified-plugin');

      expect(result).toBeTrue();
    });

    test('should return false for non-verified plugins', async () => {
      const verifiedList = createVerifiedList();
      mockReadFile.mockResolvedValue(JSON.stringify(verifiedList));

      const result = await service.isVerified('@brika/unknown-plugin');

      expect(result).toBeFalse();
    });
  });

  describe('getVerifiedPlugin', () => {
    test('should return plugin details for verified plugins', async () => {
      const verifiedList = createVerifiedList();
      mockReadFile.mockResolvedValue(JSON.stringify(verifiedList));

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
      mockReadFile.mockResolvedValue(JSON.stringify(verifiedList));

      const result = await service.getVerifiedPlugin('@brika/nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getFeaturedPlugins', () => {
    test('should return only featured plugins', async () => {
      const verifiedList = createVerifiedList();
      mockReadFile.mockResolvedValue(JSON.stringify(verifiedList));

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
      mockReadFile.mockResolvedValue(JSON.stringify(verifiedList));

      const result = await service.getFeaturedPlugins();

      expect(result).toHaveLength(0);
    });
  });

  describe('refresh', () => {
    test('should force refetch of verified list', async () => {
      const initialList = createVerifiedList();
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

      mockReadFile.mockResolvedValueOnce(JSON.stringify(initialList));

      await service.init();
      const beforeRefresh = await service.isVerified('@brika/new-plugin');
      expect(beforeRefresh).toBeFalse();

      mockReadFile.mockResolvedValueOnce(JSON.stringify(updatedList));

      await service.refresh();
      const afterRefresh = await service.isVerified('@brika/new-plugin');

      expect(afterRefresh).toBeTrue();
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    test('should handle malformed JSON response', async () => {
      mockReadFile.mockResolvedValue('not json');

      const result = await service.getVerifiedList();

      expect(result.plugins).toHaveLength(0);
    });

    test('should handle response with plugins as non-array', async () => {
      mockReadFile.mockResolvedValue(
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
