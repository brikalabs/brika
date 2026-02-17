/**
 * Tests for WorkspaceSearchService
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { useBunMock } from '@brika/testing';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { Logger } from '@/runtime/logs/log-router';
import { WorkspaceSearchService } from '@/runtime/services/workspace-search';

useTestBed({ autoStub: false });

describe('WorkspaceSearchService', () => {
  const bun = useBunMock();
  let service: WorkspaceSearchService;
  let mockConfigLoader: {
    getWorkspaceRoot: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
  };

  const validPlugin = {
    name: '@brika/plugin-timer',
    version: '1.0.0',
    displayName: 'Timer',
    description: 'A timer plugin',
    author: 'Test',
    keywords: ['brika', 'timer'],
    engines: { brika: '^0.1.0' },
  };

  const secondPlugin = {
    name: '@brika/plugin-weather',
    version: '2.0.0',
    displayName: 'Weather',
    description: 'A weather plugin',
    author: 'Test',
    keywords: ['brika', 'weather', 'forecast'],
    engines: { brika: '^0.1.0' },
  };

  beforeEach(() => {
    mockConfigLoader = {
      getWorkspaceRoot: mock().mockResolvedValue('/workspace'),
      get: mock().mockReturnValue({ plugins: [] }),
    };

    stub(Logger);
    stub(ConfigLoader, mockConfigLoader);
    service = get(WorkspaceSearchService);
  });

  // ─── discover ──────────────────────────────────────────────────────────────

  describe('discover', () => {
    test('returns plugins from workspace plugins directory', async () => {
      bun
        .directory('/workspace/plugins', ['timer/package.json'])
        .fs({ '/workspace/plugins/timer/package.json': validPlugin })
        .apply();

      const results = await service.discover();

      expect(results).toHaveLength(1);
      expect(results[0].package.name).toBe('@brika/plugin-timer');
      expect(results[0].package.version).toBe('1.0.0');
      expect(results[0].package.displayName).toBe('Timer');
      expect(results[0].package.description).toBe('A timer plugin');
      expect(results[0].installed).toBe(false);
    });

    test('marks plugin as installed when in config', async () => {
      mockConfigLoader.get.mockReturnValue({
        plugins: [{ name: '@brika/plugin-timer', version: 'workspace:*' }],
      });

      bun
        .directory('/workspace/plugins', ['timer/package.json'])
        .fs({ '/workspace/plugins/timer/package.json': validPlugin })
        .apply();

      const results = await service.discover();

      expect(results).toHaveLength(1);
      expect(results[0].installed).toBe(true);
      expect(results[0].installedVersion).toBe('1.0.0');
    });

    test('returns empty array when no plugins directory', async () => {
      bun.apply();

      const results = await service.discover();

      expect(results).toEqual([]);
    });

    test('skips invalid package.json files', async () => {
      bun
        .directory('/workspace/plugins', ['valid/package.json', 'invalid/package.json'])
        .fs({
          '/workspace/plugins/valid/package.json': validPlugin,
          '/workspace/plugins/invalid/package.json': { name: 123 }, // invalid: name must be string
        })
        .apply();

      const results = await service.discover();

      expect(results).toHaveLength(1);
      expect(results[0].package.name).toBe('@brika/plugin-timer');
    });

    test('discovers multiple plugins', async () => {
      bun
        .directory('/workspace/plugins', ['timer/package.json', 'weather/package.json'])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
          '/workspace/plugins/weather/package.json': secondPlugin,
        })
        .apply();

      const results = await service.discover();

      expect(results).toHaveLength(2);
      const names = results.map((r) => r.package.name);
      expect(names).toContain('@brika/plugin-timer');
      expect(names).toContain('@brika/plugin-weather');
    });

    // ─── Query filtering ──────────────────────────────────────────────

    test('filters by name query', async () => {
      bun
        .directory('/workspace/plugins', ['timer/package.json', 'weather/package.json'])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
          '/workspace/plugins/weather/package.json': secondPlugin,
        })
        .apply();

      const results = await service.discover('timer');

      expect(results).toHaveLength(1);
      expect(results[0].package.name).toBe('@brika/plugin-timer');
    });

    test('filters by description query', async () => {
      bun
        .directory('/workspace/plugins', ['timer/package.json', 'weather/package.json'])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
          '/workspace/plugins/weather/package.json': secondPlugin,
        })
        .apply();

      const results = await service.discover('weather');

      expect(results).toHaveLength(1);
      expect(results[0].package.name).toBe('@brika/plugin-weather');
    });

    test('filters by keyword query', async () => {
      bun
        .directory('/workspace/plugins', ['timer/package.json', 'weather/package.json'])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
          '/workspace/plugins/weather/package.json': secondPlugin,
        })
        .apply();

      const results = await service.discover('forecast');

      expect(results).toHaveLength(1);
      expect(results[0].package.name).toBe('@brika/plugin-weather');
    });

    test('query is case-insensitive', async () => {
      bun
        .directory('/workspace/plugins', ['timer/package.json'])
        .fs({ '/workspace/plugins/timer/package.json': validPlugin })
        .apply();

      const results = await service.discover('TIMER');

      expect(results).toHaveLength(1);
    });

    test('returns empty when query matches nothing', async () => {
      bun
        .directory('/workspace/plugins', ['timer/package.json'])
        .fs({ '/workspace/plugins/timer/package.json': validPlugin })
        .apply();

      const results = await service.discover('nonexistent');

      expect(results).toEqual([]);
    });
  });

  // ─── findByName ────────────────────────────────────────────────────────────

  describe('findByName', () => {
    test('finds plugin by exact name', async () => {
      bun
        .directory('/workspace/plugins', ['timer/package.json'])
        .fs({ '/workspace/plugins/timer/package.json': validPlugin })
        .apply();

      const result = await service.findByName('@brika/plugin-timer');

      expect(result).not.toBeNull();
      expect(result?.pkg.name).toBe('@brika/plugin-timer');
      expect(result?.rootDir).toBe('/workspace/plugins/timer');
    });

    test('returns null when plugin not found', async () => {
      bun
        .directory('/workspace/plugins', ['timer/package.json'])
        .fs({ '/workspace/plugins/timer/package.json': validPlugin })
        .apply();

      const result = await service.findByName('@brika/plugin-nonexistent');

      expect(result).toBeNull();
    });

    test('returns null when no plugins directory', async () => {
      bun.apply();

      const result = await service.findByName('@brika/plugin-timer');

      expect(result).toBeNull();
    });

    test('skips invalid package.json and finds valid one', async () => {
      bun
        .directory('/workspace/plugins', ['broken/package.json', 'timer/package.json'])
        .fs({
          '/workspace/plugins/broken/package.json': 'not json',
          '/workspace/plugins/timer/package.json': validPlugin,
        })
        .apply();

      const result = await service.findByName('@brika/plugin-timer');

      expect(result).not.toBeNull();
      expect(result?.pkg.name).toBe('@brika/plugin-timer');
    });
  });
});
