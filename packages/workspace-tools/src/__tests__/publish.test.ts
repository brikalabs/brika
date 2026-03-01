import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { plurals } from '../plurals';
import {
  buildPublishArgs,
  countExports,
  fetchPublishedVersion,
  formatNpmStatus,
  formatPackagePreview,
  getBinNames,
  getHooks,
  readPackageDetails,
} from '../publish-utils';
import { getPrivateWorkspaceDependencyWarnings } from '../publish-warnings';

describe('plurals', () => {
  test('returns singular form for count of 1', () => {
    expect(
      plurals(
        {
          one: '# package',
          other: '# packages',
        },
        1
      )
    ).toBe('1 package');
  });

  test('supports exact value forms such as =0', () => {
    expect(
      plurals(
        {
          '=0': 'no packages',
          one: '# package',
          other: '# packages',
        },
        0
      )
    ).toBe('no packages');
    expect(
      plurals(
        {
          '=0': 'no packages',
          one: '# package',
          other: '# packages',
        },
        2
      )
    ).toBe('2 packages');
  });

  test('uses locale category overrides via forms', () => {
    const output = plurals(
      {
        one: '# entry',
        two: '# dual-entry',
        other: '# entries',
      },
      2,
      {
        locale: 'ar',
        numberFormat: new Intl.NumberFormat('en'),
      }
    );
    expect(output).toBe('2 dual-entry');
  });

  test('prefers exact value form over plural category', () => {
    const output = plurals(
      {
        '=2': 'exact two',
        two: '# dual-entry',
        other: '# entries',
      },
      2,
      {
        locale: 'ar',
      }
    );
    expect(output).toBe('exact two');
  });

  test('supports forms without # placeholder', () => {
    expect(
      plurals(
        {
          one: 'package',
          other: 'packages',
        },
        1
      )
    ).toBe('package');
    expect(
      plurals(
        {
          one: 'package',
          other: 'packages',
        },
        2
      )
    ).toBe('packages');
  });

  test('formats # with provided number formatter', () => {
    const output = plurals(
      {
        other: '# packages',
      },
      1000,
      {
        numberFormat: new Intl.NumberFormat('de-DE'),
      }
    );
    expect(output).toBe('1.000 packages');
  });
});

describe('countExports', () => {
  test('returns 1 for non-object exports', () => {
    expect(countExports('./index.js')).toBe(1);
    expect(countExports(null)).toBe(1);
    expect(countExports(undefined)).toBe(1);
  });

  test('counts keys in object exports', () => {
    expect(
      countExports({
        '.': './index.js',
      })
    ).toBe(1);
    expect(
      countExports({
        '.': './index.js',
        './types': './types.js',
      })
    ).toBe(2);
    expect(countExports({})).toBe(0);
  });
});

describe('getBinNames', () => {
  test('returns empty array when bin is undefined', () => {
    expect(getBinNames('my-pkg', undefined)).toEqual([]);
  });

  test('returns package name for string shorthand', () => {
    expect(getBinNames('my-cli', './bin/cli.js')).toEqual(['my-cli']);
  });

  test('returns keys for object form', () => {
    expect(
      getBinNames('my-pkg', {
        foo: './foo.js',
        bar: './bar.js',
      })
    ).toEqual(['foo', 'bar']);
  });
});

describe('getHooks', () => {
  test('returns empty array when no scripts', () => {
    expect(getHooks(undefined)).toEqual([]);
    expect(getHooks({})).toEqual([]);
  });

  test('includes prepublishOnly when present', () => {
    expect(
      getHooks({
        prepublishOnly: 'tsc',
      })
    ).toEqual(['prepublishOnly']);
  });

  test('includes build when present', () => {
    expect(
      getHooks({
        build: 'bun run generate',
      })
    ).toEqual(['build']);
  });

  test('includes both when both present', () => {
    expect(
      getHooks({
        prepublishOnly: 'tsc',
        build: 'bun run generate',
      })
    ).toEqual(['prepublishOnly', 'build']);
  });

  test('ignores unrelated scripts', () => {
    expect(
      getHooks({
        dev: 'bun run src/index.ts',
        test: 'bun test',
      })
    ).toEqual([]);
  });
});

describe('formatNpmStatus', () => {
  test('returns "not yet published" for null', () => {
    const output = formatNpmStatus('1.0.0', null);
    expect(output).toContain('not yet published');
  });

  test('warns when local version matches published', () => {
    const output = formatNpmStatus('1.0.0', '1.0.0');
    expect(output).toContain('already published');
  });

  test('shows published version when older than local', () => {
    const output = formatNpmStatus('1.0.0', '0.9.0');
    expect(output).toContain('0.9.0');
  });
});

describe('buildPublishArgs', () => {
  test('returns base args when not dry-run', () => {
    expect(buildPublishArgs(false)).toEqual([
      'bun',
      'publish',
      '--access',
      'public',
      '--ignore-scripts',
    ]);
  });

  test('appends --dry-run flag', () => {
    expect(buildPublishArgs(true)).toEqual([
      'bun',
      'publish',
      '--access',
      'public',
      '--ignore-scripts',
      '--dry-run',
    ]);
  });
});

describe('getPrivateWorkspaceDependencyWarnings', () => {
  test('warns when package depends on private workspace packages', () => {
    const warnings = getPrivateWorkspaceDependencyWarnings(
      {
        dependencyNames: ['@brika/private-a', '@brika/public-a', '@brika/private-b'],
      },
      new Set(['@brika/private-a', '@brika/private-b'])
    );
    expect(warnings).toEqual([
      'depends on private workspace package "@brika/private-a"',
      'depends on private workspace package "@brika/private-b"',
    ]);
  });

  test('returns no warnings without matches', () => {
    const warnings = getPrivateWorkspaceDependencyWarnings(
      {
        dependencyNames: ['@brika/public-a'],
      },
      new Set(['@brika/private-a'])
    );
    expect(warnings).toEqual([]);
  });
});

describe('formatPackagePreview', () => {
  test('includes name and version', () => {
    const output = formatPackagePreview('@brika/sdk', '1.0.0', {});
    expect(output).toContain('@brika/sdk');
    expect(output).toContain('1.0.0');
  });

  test('shows description when present', () => {
    const output = formatPackagePreview('my-pkg', '1.0.0', {
      description: 'A cool package',
    });
    expect(output).toContain('A cool package');
  });

  test('omits description when absent', () => {
    const output = formatPackagePreview('my-pkg', '1.0.0', {});
    expect(output).not.toContain('description');
  });

  test('shows files list when present', () => {
    const output = formatPackagePreview('my-pkg', '1.0.0', {
      files: ['src', 'dist'],
    });
    expect(output).toContain('src');
    expect(output).toContain('dist');
  });

  test('shows export count for object exports', () => {
    const output = formatPackagePreview('my-pkg', '1.0.0', {
      exports: {
        '.': './index.js',
        './types': './types.js',
      },
    });
    expect(output).toContain('2 paths');
  });

  test('shows singular export path', () => {
    const output = formatPackagePreview('my-pkg', '1.0.0', {
      exports: {
        '.': './index.js',
      },
    });
    expect(output).toContain('1 path');
    expect(output).not.toContain('1 paths');
  });

  test('shows bin names', () => {
    const output = formatPackagePreview('create-brika', '1.0.0', {
      bin: {
        'create-brika': './src/index.ts',
      },
    });
    expect(output).toContain('create-brika');
  });

  test('shows hooks when prepublishOnly present', () => {
    const output = formatPackagePreview('my-pkg', '1.0.0', {
      scripts: {
        prepublishOnly: 'bun run tsc',
      },
    });
    expect(output).toContain('prepublishOnly');
    expect(output).toContain('✓');
  });

  test('omits hooks section when no relevant scripts', () => {
    const output = formatPackagePreview('my-pkg', '1.0.0', {
      scripts: {
        dev: 'bun run src/index.ts',
      },
    });
    expect(output).not.toContain('hooks');
  });

  test('renders minimal package with warning block under package name', () => {
    const output = formatPackagePreview('@scope/pkg', '0.1.0', {});
    const lines = output.split('\n').filter((l) => l.trim() !== '');
    expect(lines[0]).toContain('@scope/pkg');
    expect(lines[1]).toContain('⚠');
  });

  test('omits npm line when publishedVersion is not provided', () => {
    const output = formatPackagePreview('my-pkg', '1.0.0', {});
    expect(output).not.toContain('npm:');
  });

  test('shows npm line when publishedVersion is null (not yet published)', () => {
    const output = formatPackagePreview('my-pkg', '1.0.0', {}, null);
    expect(output).toContain('npm:');
    expect(output).toContain('not yet published');
  });

  test('shows npm line with published version when older', () => {
    const output = formatPackagePreview('my-pkg', '1.0.0', {}, '0.9.0');
    expect(output).toContain('npm:');
    expect(output).toContain('0.9.0');
  });

  test('warns when already published at same version', () => {
    const output = formatPackagePreview('my-pkg', '1.0.0', {}, '1.0.0');
    expect(output).toContain('already published');
  });

  test('shows warning details when important metadata is missing', () => {
    const output = formatPackagePreview(
      'my-pkg',
      '1.0.0',
      {
        hasReadme: false,
      },
      null
    );
    expect(output).toContain('⚠');
    expect(output).toContain('README.md missing');
    expect(output).toContain('license missing');
    expect(output).toContain('repository missing');
    expect(output).toContain('keywords missing');
  });

  test('omits warning line when metadata is complete', () => {
    const output = formatPackagePreview(
      'my-pkg',
      '1.0.0',
      {
        hasReadme: true,
        license: 'MIT',
        hasRepository: true,
        keywordsCount: 3,
      },
      '0.9.0'
    );
    expect(output).not.toContain('⚠');
  });

  test('shows plugin metadata for plugin packages', () => {
    const output = formatPackagePreview(
      '@brika/plugin-matter',
      '0.3.0',
      {
        plugin: {
          displayName: 'Matter',
          enginesBrika: '^0.2.0',
          blocksCount: 1,
          bricksCount: 2,
          sparksCount: 2,
          pagesCount: 1,
          hasActions: true,
        },
        hasReadme: true,
        license: 'MIT',
        hasRepository: true,
        keywordsCount: 3,
      },
      null
    );
    expect(output).toContain('plugin');
    expect(output).toContain('yes');
    expect(output).toContain('Matter');
    expect(output).toContain('^0.2.0');
    expect(output).toContain('1 block');
    expect(output).toContain('2 bricks');
    expect(output).toContain('2 sparks');
    expect(output).toContain('1 page');
    expect(output).toContain('actions');
  });

  test('shows extra warnings from verifier output', () => {
    const output = formatPackagePreview(
      '@brika/plugin-spotify',
      '0.3.0',
      {
        plugin: {
          displayName: 'Spotify',
          enginesBrika: '^0.2.0',
        },
        hasReadme: true,
        license: 'MIT',
        hasRepository: true,
        keywordsCount: 2,
      },
      null,
      ['engines.brika "^0.2.0" does not cover current SDK version 0.3.0']
    );
    expect(output).toContain('does not cover current SDK version 0.3.0');
  });

  test('shows keyword warnings from verifier output', () => {
    const output = formatPackagePreview(
      '@brika/plugin-spotify',
      '0.3.0',
      {
        plugin: {
          displayName: 'Spotify',
          enginesBrika: '^0.3.0',
        },
        hasReadme: true,
        license: 'MIT',
        hasRepository: true,
        keywordsCount: 1,
      },
      null,
      ['keywords must include "brika" so the plugin can be found by the npm registry search']
    );
    expect(output).toContain('keywords must include "brika"');
  });
});

// ─── readPackageDetails ───────────────────────────────────────────────────────

describe('readPackageDetails', () => {
  const bun = useBunMock();

  test('reads all publishable fields', async () => {
    const path = '/workspace/my-pkg/package.json';
    bun
      .fs({
        [path]: {
          name: 'my-pkg',
          version: '1.0.0',
          description: 'A package',
          files: ['src', 'dist'],
          exports: {
            '.': './index.js',
          },
          bin: {
            'my-cli': './bin.js',
          },
          scripts: {
            build: 'tsc',
          },
          dependencies: {
            '@brika/public-dep': '^1.0.0',
          },
          peerDependencies: {
            '@brika/peer-dep': '^1.0.0',
          },
          optionalDependencies: {
            '@brika/optional-dep': '^1.0.0',
          },
          license: 'MIT',
          repository: 'https://github.com/example/repo',
          keywords: ['sdk', 'tools'],
        },
        '/workspace/my-pkg/README.md': '# Readme',
      })
      .apply();

    const details = await readPackageDetails(path);
    expect(details.description).toBe('A package');
    expect(details.files).toEqual(['src', 'dist']);
    expect(details.exports).toEqual({
      '.': './index.js',
    });
    expect(details.bin).toEqual({
      'my-cli': './bin.js',
    });
    expect(details.scripts).toEqual({
      build: 'tsc',
    });
    expect(details.hasReadme).toBe(true);
    expect(details.license).toBe('MIT');
    expect(details.hasRepository).toBe(true);
    expect(details.keywordsCount).toBe(2);
    expect(details.dependencyNames).toEqual([
      '@brika/optional-dep',
      '@brika/peer-dep',
      '@brika/public-dep',
    ]);
  });

  test('returns undefined fields when absent', async () => {
    const path = '/workspace/minimal/package.json';
    bun
      .file(path, {
        name: 'minimal',
        version: '1.0.0',
      })
      .apply();

    const details = await readPackageDetails(path);
    expect(details.description).toBeUndefined();
    expect(details.files).toBeUndefined();
    expect(details.exports).toBeUndefined();
    expect(details.bin).toBeUndefined();
    expect(details.hasReadme).toBe(false);
    expect(details.license).toBeUndefined();
    expect(details.hasRepository).toBe(false);
    expect(details.keywordsCount).toBeUndefined();
    expect(details.dependencyNames).toBeUndefined();
  });

  test('detects README.md with case-insensitive filename', async () => {
    const path = '/workspace/readme-case/package.json';
    bun
      .fs({
        [path]: {
          name: 'readme-case',
          version: '1.0.0',
        },
        '/workspace/readme-case/ReadMe.MD': '# Readme',
      })
      .apply();

    const details = await readPackageDetails(path);
    expect(details.hasReadme).toBe(true);
  });

  test('collects unique publish dependency names and ignores devDependencies', async () => {
    const path = '/workspace/with-deps/package.json';
    bun
      .file(path, {
        name: 'with-deps',
        version: '1.0.0',
        dependencies: {
          '@brika/a': '^1.0.0',
        },
        peerDependencies: {
          '@brika/a': '^1.0.0',
          '@brika/b': '^1.0.0',
        },
        optionalDependencies: {
          '@brika/c': '^1.0.0',
        },
        devDependencies: {
          '@brika/dev-only': '^1.0.0',
        },
      })
      .apply();

    const details = await readPackageDetails(path);
    expect(details.dependencyNames).toEqual(['@brika/a', '@brika/b', '@brika/c']);
  });
});

// ─── fetchPublishedVersion ────────────────────────────────────────────────────

describe('fetchPublishedVersion', () => {
  const bun = useBunMock();

  test('returns the version from npm registry', async () => {
    bun
      .fetch(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              version: '2.3.4',
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            }
          )
        )
      )
      .apply();

    const version = await fetchPublishedVersion('my-pkg');
    expect(version).toBe('2.3.4');
  });

  test('returns null on 404 (package not published)', async () => {
    bun
      .fetch(() =>
        Promise.resolve(
          new Response('Not Found', {
            status: 404,
          })
        )
      )
      .apply();

    const version = await fetchPublishedVersion('unpublished-pkg');
    expect(version).toBeNull();
  });

  test('returns null when version field is missing', async () => {
    bun
      .fetch(() =>
        Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          })
        )
      )
      .apply();

    const version = await fetchPublishedVersion('my-pkg');
    expect(version).toBeNull();
  });

  test('returns null on network error', async () => {
    bun.fetch(() => Promise.reject(new Error('Network error'))).apply();
    const version = await fetchPublishedVersion('my-pkg');
    expect(version).toBeNull();
  });
});
