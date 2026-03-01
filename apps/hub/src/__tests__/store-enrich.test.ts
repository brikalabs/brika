/**
 * Tests for store enrichment utilities
 */
import { describe, expect, test } from 'bun:test';
import { computeEnrichment, enrichPlugins } from '@/runtime/store/enrich';

const makeConfig = (
  installed: Array<{
    name: string;
    version: string;
  }>
) => ({
  plugins: installed,
});

describe('computeEnrichment', () => {
  test('marks plugin as installed when found in config', () => {
    const result = computeEnrichment(
      {
        name: '@brika/test',
        version: '1.0.0',
        engines: {
          brika: '>=0.1.0',
        },
      },
      makeConfig([
        {
          name: '@brika/test',
          version: '1.0.0',
        },
      ])
    );
    expect(result.installed).toBe(true);
    expect(result.installedVersion).toBe('1.0.0');
  });

  test('marks plugin as not installed when not in config', () => {
    const result = computeEnrichment(
      {
        name: '@brika/test',
        version: '1.0.0',
      },
      makeConfig([])
    );
    expect(result.installed).toBe(false);
    expect(result.installedVersion).toBeUndefined();
  });

  test('checks compatibility with engine requirement', () => {
    const result = computeEnrichment(
      {
        name: '@brika/test',
        version: '1.0.0',
        engines: {
          brika: '>=0.1.0',
        },
      },
      makeConfig([])
    );
    expect(result.compatible).toBe(true);
  });

  test('returns incompatible when no engines field', () => {
    const result = computeEnrichment(
      {
        name: '@brika/test',
        version: '1.0.0',
      },
      makeConfig([])
    );
    expect(result.compatible).toBe(false);
  });
});

describe('enrichPlugins', () => {
  test('enriches a list of plugins with install status and compatibility', () => {
    const plugins = [
      {
        package: {
          name: '@brika/a',
          version: '1.0.0',
          engines: {
            brika: '>=0.1.0',
          },
        },
        source: 'npm',
        installVersion: '1.0.0',
        downloadCount: 100,
      },
      {
        package: {
          name: '@brika/b',
          version: '2.0.0',
        },
        source: 'npm',
        installVersion: '2.0.0',
        downloadCount: 50,
      },
    ];
    const config = makeConfig([
      {
        name: '@brika/a',
        version: '1.0.0',
      },
    ]);

    const enriched = enrichPlugins(plugins, config);
    expect(enriched).toHaveLength(2);
    expect(enriched[0].installed).toBe(true);
    expect(enriched[0].compatible).toBe(true);
    expect(enriched[1].installed).toBe(false);
    expect(enriched[1].compatible).toBe(false);
  });

  test('returns empty array for empty input', () => {
    expect(enrichPlugins([], makeConfig([]))).toEqual([]);
  });
});
