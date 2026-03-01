import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkspacePackage } from '../workspace';
import {
  applyVersionToPackages,
  discoverPackages,
  filterPackages,
  writeVersion,
} from '../workspace';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePackage(name: string, overrides: Partial<WorkspacePackage> = {}): WorkspacePackage {
  return {
    name,
    version: '1.0.0',
    path: `/tmp/${name}/package.json`,
    relativePath: `packages/${name}/package.json`,
    isPrivate: false,
    ...overrides,
  };
}

async function writePkg(dir: string, content: object): Promise<string> {
  const pkgPath = join(dir, 'package.json');
  await writeFile(pkgPath, JSON.stringify(content, null, 2));
  return pkgPath;
}

// ---------------------------------------------------------------------------
// filterPackages
// ---------------------------------------------------------------------------

describe('filterPackages', () => {
  const packages = [
    makePackage('@brika/sdk'),
    makePackage('@brika/hub'),
    makePackage('@brika/ui'),
    makePackage('create-brika'),
  ];

  test('returns all packages when no patterns given', () => {
    expect(filterPackages(packages, [])).toEqual(packages);
  });

  test('exact name match', () => {
    const result = filterPackages(packages, ['@brika/sdk']);
    expect(result.map((p) => p.name)).toEqual(['@brika/sdk']);
  });

  test('substring match', () => {
    const result = filterPackages(packages, ['hub']);
    expect(result.map((p) => p.name)).toEqual(['@brika/hub']);
  });

  test('glob match', () => {
    const result = filterPackages(packages, ['@brika/*']);
    expect(result.map((p) => p.name)).toEqual(['@brika/sdk', '@brika/hub', '@brika/ui']);
  });

  test('multiple patterns are OR-ed', () => {
    const result = filterPackages(packages, ['@brika/sdk', 'create-brika']);
    expect(result.map((p) => p.name)).toEqual(['@brika/sdk', 'create-brika']);
  });

  test('returns empty array when nothing matches', () => {
    expect(filterPackages(packages, ['nonexistent'])).toEqual([]);
  });

  test('deduplicates when multiple patterns match same package', () => {
    // 'sdk' substring and '@brika/sdk' exact both match @brika/sdk
    const result = filterPackages(packages, ['sdk', '@brika/sdk']);
    expect(result.map((p) => p.name)).toEqual(['@brika/sdk']);
  });
});

// ---------------------------------------------------------------------------
// writeVersion
// ---------------------------------------------------------------------------

describe('writeVersion', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'brika-ws-'));
  });

  afterEach(async () => {
    await rm(tmpDir, {
      recursive: true,
      force: true,
    });
  });

  test('updates version field in package.json', async () => {
    const pkgPath = await writePkg(tmpDir, {
      name: 'my-pkg',
      version: '1.0.0',
    });
    await writeVersion(pkgPath, '2.0.0');
    const updated = (await Bun.file(pkgPath).json()) as {
      version: string;
    };
    expect(updated.version).toBe('2.0.0');
  });

  test('preserves other fields', async () => {
    const pkgPath = await writePkg(tmpDir, {
      name: 'my-pkg',
      version: '1.0.0',
      private: true,
    });
    await writeVersion(pkgPath, '1.1.0');
    const updated = (await Bun.file(pkgPath).json()) as {
      name: string;
      private: boolean;
    };
    expect(updated.name).toBe('my-pkg');
    expect(updated.private).toBe(true);
  });

  test('handles patch, minor, and major bumps', async () => {
    const pkgPath = await writePkg(tmpDir, {
      version: '0.1.2',
    });
    await writeVersion(pkgPath, '0.1.3');
    expect(
      (
        (await Bun.file(pkgPath).json()) as {
          version: string;
        }
      ).version
    ).toBe('0.1.3');
    await writeVersion(pkgPath, '0.2.0');
    expect(
      (
        (await Bun.file(pkgPath).json()) as {
          version: string;
        }
      ).version
    ).toBe('0.2.0');
    await writeVersion(pkgPath, '1.0.0');
    expect(
      (
        (await Bun.file(pkgPath).json()) as {
          version: string;
        }
      ).version
    ).toBe('1.0.0');
  });

  test('preserves existing spacing around version value', async () => {
    const pkgPath = join(tmpDir, 'package.json');
    const initial = '{\n\t"name": "my-pkg",\n\t"version":"1.0.0",\n\t"private": true\n}\n';
    await writeFile(pkgPath, initial);

    await writeVersion(pkgPath, '2.0.0');

    const updated = await Bun.file(pkgPath).text();
    expect(updated).toBe('{\n\t"name": "my-pkg",\n\t"version":"2.0.0",\n\t"private": true\n}\n');
  });
});

// ---------------------------------------------------------------------------
// applyVersionToPackages
// ---------------------------------------------------------------------------

describe('applyVersionToPackages', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'brika-ws-'));
  });

  afterEach(async () => {
    await rm(tmpDir, {
      recursive: true,
      force: true,
    });
  });

  test('writes version when not dry-run', async () => {
    const pkgPath = await writePkg(tmpDir, {
      name: 'a',
      version: '1.0.0',
    });
    const pkg = makePackage('a', {
      path: pkgPath,
    });

    await applyVersionToPackages([pkg], '2.0.0', false);

    const updated = (await Bun.file(pkgPath).json()) as {
      version: string;
    };
    expect(updated.version).toBe('2.0.0');
  });

  test('does not write files in dry-run mode', async () => {
    const pkgPath = await writePkg(tmpDir, {
      name: 'a',
      version: '1.0.0',
    });
    const pkg = makePackage('a', {
      path: pkgPath,
    });

    await applyVersionToPackages([pkg], '2.0.0', true);

    const unchanged = (await Bun.file(pkgPath).json()) as {
      version: string;
    };
    expect(unchanged.version).toBe('1.0.0');
  });

  test('returns the input packages', async () => {
    const pkgPath = await writePkg(tmpDir, {
      name: 'a',
      version: '1.0.0',
    });
    const pkg = makePackage('a', {
      path: pkgPath,
    });

    const result = await applyVersionToPackages([pkg], '2.0.0');
    expect(result).toEqual([pkg]);
  });

  test('applies version to multiple packages', async () => {
    const paths = await Promise.all(
      ['a', 'b', 'c'].map((n) =>
        writePkg(tmpDir, {
          name: n,
          version: '1.0.0',
        })
      )
    );
    const pkgs = paths.map((p, i) =>
      makePackage(String.fromCharCode(97 + i), {
        path: p,
      })
    );

    await applyVersionToPackages(pkgs, '3.0.0');

    for (const p of paths) {
      const updated = (await Bun.file(p).json()) as {
        version: string;
      };
      expect(updated.version).toBe('3.0.0');
    }
  });
});

// ---------------------------------------------------------------------------
// discoverPackages
// ---------------------------------------------------------------------------

describe('discoverPackages', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'brika-discover-'));
  });

  afterEach(async () => {
    await rm(tmpDir, {
      recursive: true,
      force: true,
    });
  });

  async function setup(root: object, workspacePackages: Record<string, object>): Promise<void> {
    await writePkg(tmpDir, root);
    for (const [rel, pkg] of Object.entries(workspacePackages)) {
      const dir = join(tmpDir, rel);
      await mkdir(dir, {
        recursive: true,
      });
      await writePkg(dir, pkg);
    }
  }

  test('includes root package when it has a version', async () => {
    await setup(
      {
        name: 'my-root',
        version: '1.0.0',
        workspaces: [],
      },
      {}
    );
    const pkgs = await discoverPackages(tmpDir);
    expect(pkgs[0]?.name).toBe('my-root');
    expect(pkgs[0]?.relativePath).toBe('package.json');
  });

  test('omits root when it has no version', async () => {
    await setup(
      {
        name: 'my-root',
        workspaces: ['packages/*'],
      },
      {
        'packages/a': {
          name: '@scope/a',
          version: '0.1.0',
        },
      }
    );
    const pkgs = await discoverPackages(tmpDir);
    expect(pkgs.every((p) => p.name !== 'my-root')).toBe(true);
  });

  test('discovers workspace packages', async () => {
    await setup(
      {
        name: 'root',
        version: '1.0.0',
        workspaces: ['packages/*'],
      },
      {
        'packages/alpha': {
          name: '@scope/alpha',
          version: '0.1.0',
        },
        'packages/beta': {
          name: '@scope/beta',
          version: '0.2.0',
        },
      }
    );
    const pkgs = await discoverPackages(tmpDir);
    const names = pkgs.map((p) => p.name);
    expect(names).toContain('@scope/alpha');
    expect(names).toContain('@scope/beta');
  });

  test('skips workspace packages without a version', async () => {
    await setup(
      {
        name: 'root',
        version: '1.0.0',
        workspaces: ['packages/*'],
      },
      {
        'packages/no-ver': {
          name: 'no-version-pkg',
        },
        'packages/has-ver': {
          name: 'has-version-pkg',
          version: '1.0.0',
        },
      }
    );
    const pkgs = await discoverPackages(tmpDir);
    expect(pkgs.map((p) => p.name)).not.toContain('no-version-pkg');
    expect(pkgs.map((p) => p.name)).toContain('has-version-pkg');
  });

  test('sets isPrivate from private field', async () => {
    await setup(
      {
        name: 'root',
        version: '1.0.0',
        workspaces: ['packages/*'],
      },
      {
        'packages/pub': {
          name: 'pub',
          version: '1.0.0',
          private: false,
        },
        'packages/priv': {
          name: 'priv',
          version: '1.0.0',
          private: true,
        },
      }
    );
    const pkgs = await discoverPackages(tmpDir);
    expect(pkgs.find((p) => p.name === 'pub')?.isPrivate).toBe(false);
    expect(pkgs.find((p) => p.name === 'priv')?.isPrivate).toBe(true);
  });

  test('defaults isPrivate to false when field is absent', async () => {
    await setup(
      {
        name: 'root',
        version: '1.0.0',
        workspaces: ['packages/*'],
      },
      {
        'packages/a': {
          name: 'a',
          version: '1.0.0',
        },
      }
    );
    const pkgs = await discoverPackages(tmpDir);
    expect(pkgs.find((p) => p.name === 'a')?.isPrivate).toBe(false);
  });
});
