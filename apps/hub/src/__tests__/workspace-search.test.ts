/**
 * Tests for LocalRegistry
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { useBunMock } from '@brika/testing';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { Logger } from '@/runtime/logs/log-router';
import { LocalRegistry } from '@/runtime/store';

useTestBed({
  autoStub: false,
});

describe('LocalRegistry', () => {
  const bun = useBunMock();
  let service: LocalRegistry;

  const validPlugin = {
    name: '@brika/plugin-timer',
    version: '1.0.0',
    main: './src/index.ts',
    displayName: 'Timer',
    description: 'A timer plugin',
    author: 'Test',
    keywords: [
      'brika',
      'timer',
    ],
    engines: {
      brika: '^0.1.0',
    },
  };

  const secondPlugin = {
    name: '@brika/plugin-weather',
    version: '2.0.0',
    main: './src/index.ts',
    displayName: 'Weather',
    description: 'A weather plugin',
    author: 'Test',
    keywords: [
      'brika',
      'weather',
      'forecast',
    ],
    engines: {
      brika: '^0.1.0',
    },
  };

  beforeEach(() => {
    stub(Logger);
    stub(ConfigLoader, {
      getWorkspaceRoot: mock().mockResolvedValue('/workspace'),
    });
    service = get(LocalRegistry);
  });

  // ─── search ────────────────────────────────────────────────────────────────

  describe('search', () => {
    test('returns plugins from workspace packages matching engines.brika', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'timer/package.json',
        ])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
        })
        .apply();

      const { plugins } = await service.search();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].package.name).toBe('@brika/plugin-timer');
      expect(plugins[0].package.version).toBe('1.0.0');
      expect(plugins[0].package.displayName).toBe('Timer');
      expect(plugins[0].package.description).toBe('A timer plugin');
      expect(plugins[0].source).toBe('local');
      expect(plugins[0].installVersion).toBe('workspace:*');
    });

    test('returns downloadCount 0 for local plugins', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'timer/package.json',
        ])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
        })
        .apply();

      const { plugins } = await service.search();

      expect(plugins[0].downloadCount).toBe(0);
    });

    test('returns empty when no workspaces field in root package.json', async () => {
      bun
        .fs({
          '/workspace/package.json': {},
        })
        .apply();

      const { plugins } = await service.search();

      expect(plugins).toEqual([]);
    });

    test('returns empty when root package.json is missing', async () => {
      bun.apply();

      const { plugins } = await service.search();

      expect(plugins).toEqual([]);
    });

    test('scans multiple workspace directories', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
              'apps/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'timer/package.json',
        ])
        .directory('/workspace/apps', [
          'weather/package.json',
        ])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
          '/workspace/apps/weather/package.json': secondPlugin,
        })
        .apply();

      const { plugins } = await service.search();

      expect(plugins).toHaveLength(2);
      const names = plugins.map((p) => p.package.name);
      expect(names).toContain('@brika/plugin-timer');
      expect(names).toContain('@brika/plugin-weather');
    });

    test('skips packages without engines.brika', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'packages/*',
            ],
          },
        })
        .directory('/workspace/packages', [
          'not-a-plugin/package.json',
          'timer/package.json',
        ])
        .fs({
          '/workspace/packages/not-a-plugin/package.json': {
            name: 'not-a-plugin',
            version: '1.0.0',
            main: './index.ts',
          },
          '/workspace/packages/timer/package.json': validPlugin,
        })
        .apply();

      const { plugins } = await service.search();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].package.name).toBe('@brika/plugin-timer');
    });

    test('skips invalid package.json files', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'valid/package.json',
          'invalid/package.json',
        ])
        .fs({
          '/workspace/plugins/valid/package.json': validPlugin,
          '/workspace/plugins/invalid/package.json': {
            name: 123,
          },
        })
        .apply();

      const { plugins } = await service.search();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].package.name).toBe('@brika/plugin-timer');
    });

    // ─── Query filtering ──────────────────────────────────────────────

    test('filters by name query', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'timer/package.json',
          'weather/package.json',
        ])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
          '/workspace/plugins/weather/package.json': secondPlugin,
        })
        .apply();

      const { plugins } = await service.search('timer');

      expect(plugins).toHaveLength(1);
      expect(plugins[0].package.name).toBe('@brika/plugin-timer');
    });

    test('filters by description query', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'timer/package.json',
          'weather/package.json',
        ])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
          '/workspace/plugins/weather/package.json': secondPlugin,
        })
        .apply();

      const { plugins } = await service.search('weather plugin');

      expect(plugins).toHaveLength(1);
      expect(plugins[0].package.name).toBe('@brika/plugin-weather');
    });

    test('filters by keyword query', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'timer/package.json',
          'weather/package.json',
        ])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
          '/workspace/plugins/weather/package.json': secondPlugin,
        })
        .apply();

      const { plugins } = await service.search('forecast');

      expect(plugins).toHaveLength(1);
      expect(plugins[0].package.name).toBe('@brika/plugin-weather');
    });

    test('query is case-insensitive', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'timer/package.json',
        ])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
        })
        .apply();

      const { plugins } = await service.search('TIMER');

      expect(plugins).toHaveLength(1);
    });

    test('returns empty when query matches nothing', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'timer/package.json',
        ])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
        })
        .apply();

      const { plugins } = await service.search('nonexistent');

      expect(plugins).toEqual([]);
    });
  });

  // ─── findByName ────────────────────────────────────────────────────────────

  describe('findByName', () => {
    test('finds plugin by exact name across workspace directories', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'timer/package.json',
        ])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
        })
        .apply();

      const result = await service.findByName('@brika/plugin-timer');

      expect(result).not.toBeNull();
      expect(result?.pkg.name).toBe('@brika/plugin-timer');
      expect(result?.rootDir).toBe('/workspace/plugins/timer');
    });

    test('finds plugin in a different workspace directory', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
              'apps/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'timer/package.json',
        ])
        .directory('/workspace/apps', [
          'weather/package.json',
        ])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
          '/workspace/apps/weather/package.json': secondPlugin,
        })
        .apply();

      const result = await service.findByName('@brika/plugin-weather');

      expect(result).not.toBeNull();
      expect(result?.pkg.name).toBe('@brika/plugin-weather');
      expect(result?.rootDir).toBe('/workspace/apps/weather');
    });

    test('returns null when plugin not found', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'timer/package.json',
        ])
        .fs({
          '/workspace/plugins/timer/package.json': validPlugin,
        })
        .apply();

      const result = await service.findByName('@brika/plugin-nonexistent');

      expect(result).toBeNull();
    });

    test('returns null when no workspaces configured', async () => {
      bun
        .fs({
          '/workspace/package.json': {},
        })
        .apply();

      const result = await service.findByName('@brika/plugin-timer');

      expect(result).toBeNull();
    });

    test('skips invalid package.json and finds valid one', async () => {
      bun
        .fs({
          '/workspace/package.json': {
            workspaces: [
              'plugins/*',
            ],
          },
        })
        .directory('/workspace/plugins', [
          'broken/package.json',
          'timer/package.json',
        ])
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
