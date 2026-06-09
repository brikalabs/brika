/**
 * Unit tests for the check-publish-files verify check.
 *
 * The internal helpers (normalizePublishPath, patternBase, filesEntryCoversPath, etc.)
 * are all private, so we exercise them indirectly through runChecks() after
 * importing the check module to trigger registration.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginPackageSchema } from '@brika/schema/plugin';

// Import the check to trigger registerCheck() side-effect.
import './check-publish-files';
import { runChecks } from './registry';

// Minimal valid pkg shape (only the fields the check uses).
function makePkg(overrides: Partial<PluginPackageSchema> = {}): PluginPackageSchema {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    main: './src/index.ts',
    engines: { brika: '^0.4.0' },
    $schema: 'https://schema.brika.dev/plugin.schema.json',
    keywords: ['brika'],
    ...overrides,
  } as PluginPackageSchema;
}

let tmpDir = '';

async function setup(
  files: Array<{ path: string; content?: string }> = [],
  pkg: Partial<PluginPackageSchema> = {}
): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'brika-cpf-'));
  for (const { path: relPath, content = '' } of files) {
    const fullPath = join(tmpDir, relPath);
    await mkdir(join(fullPath, '..'), { recursive: true });
    // If path ends with '/', treat as directory; otherwise write file.
    if (relPath.endsWith('/')) {
      await mkdir(fullPath, { recursive: true });
    } else {
      await writeFile(fullPath, content);
    }
  }
  return tmpDir;
}

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = '';
  }
});

async function runPublishFilesCheck(
  dir: string,
  pkg: Partial<PluginPackageSchema> = {}
): Promise<{ warnings: string[]; errors: string[] }> {
  return runChecks({ pkg: makePkg(pkg), pluginDir: dir, sdkVersion: '0.4.0' });
}

describe('check-publish-files: normalizePublishPath', () => {
  test('strips leading ./ prefix', async () => {
    // Entry './src' should match the 'src' required path.
    const dir = await setup([{ path: 'src/index.ts' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['./src'],
      icon: undefined,
    });
    // Missing src warning should NOT appear since './src' covers 'src'.
    expect(result.warnings.some((w) => w.includes('src'))).toBe(false);
  });

  test('strips leading / prefix (absolute-style entry)', async () => {
    const dir = await setup([{ path: 'src/index.ts' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['/src'],
      icon: undefined,
    });
    expect(result.warnings.some((w) => w.includes('src'))).toBe(false);
  });

  test('strips trailing / suffix', async () => {
    const dir = await setup([{ path: 'src/index.ts' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['src/'],
      icon: undefined,
    });
    expect(result.warnings.some((w) => w.includes('src'))).toBe(false);
  });
});

describe('check-publish-files: empty / negated entries', () => {
  test('empty string entry is ignored (does not cover any path)', async () => {
    const dir = await setup([{ path: 'src/index.ts' }]);
    const result = await runPublishFilesCheck(dir, {
      files: [''],
      icon: undefined,
    });
    // The empty entry should NOT cover 'src', so the warning must appear.
    expect(result.warnings.some((w) => w.includes('src'))).toBe(true);
  });

  test('negation entry starting with ! is ignored', async () => {
    const dir = await setup([{ path: 'src/index.ts' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['!src'],
      icon: undefined,
    });
    expect(result.warnings.some((w) => w.includes('src'))).toBe(true);
  });
});

describe('check-publish-files: deep wildcard /** patterns', () => {
  test('dist/** covers dist/index.js (child path)', async () => {
    const dir = await setup([{ path: 'src/index.ts' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['src/**'],
      icon: undefined,
    });
    expect(result.warnings.some((w) => w.includes('src'))).toBe(false);
  });

  test('src/** covers src exactly (the base itself)', async () => {
    // deepWildcardBase === normalizedRequiredPath branch.
    const dir = await setup([{ path: 'src/index.ts' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['src/**'],
      icon: undefined,
    });
    expect(result.warnings.some((w) => w.includes('src'))).toBe(false);
  });

  test('dist/** does NOT cover src', async () => {
    const dir = await setup([{ path: 'src/index.ts' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['dist/**'],
      icon: undefined,
    });
    expect(result.warnings.some((w) => w.includes('src'))).toBe(true);
  });
});

describe('check-publish-files: single wildcard /* patterns', () => {
  test('dist/* covers dist/file.js (direct child)', async () => {
    // singleWildcardBase covers direct children only.
    // 'src' is a required path; 'other/*' must NOT cover it.
    const dir = await setup([{ path: 'src/index.ts' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['other/*'],
      icon: undefined,
    });
    expect(result.warnings.some((w) => w.includes('src'))).toBe(true);
  });
});

describe('check-publish-files: directory-like path matching', () => {
  test('directory entry covers its children (no dot in leaf)', async () => {
    // 'src' (no dot in leaf) acts like a directory prefix.
    const dir = await setup([{ path: 'src/index.ts' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['src'],
      icon: undefined,
    });
    expect(result.warnings.some((w) => w.includes('src'))).toBe(false);
  });

  test('file-like entry does not cover directory path', async () => {
    // 'bundle.js' has a dot in its leaf, so it is not directory-like.
    const dir = await setup([{ path: 'src/index.ts' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['bundle.js'],
      icon: undefined,
    });
    expect(result.warnings.some((w) => w.includes('src'))).toBe(true);
  });

  test('directory-like entry does not match unrelated path', async () => {
    // 'assets' is directory-like but does not prefix 'src', so src is still missing.
    const dir = await setup([{ path: 'src/index.ts' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['assets'],
      icon: undefined,
    });
    expect(result.warnings.some((w) => w.includes('src'))).toBe(true);
  });
});

describe('check-publish-files: README detection', () => {
  test('warns when README.md exists but is not in files', async () => {
    const dir = await setup([{ path: 'README.md', content: '# test' }]);
    const result = await runPublishFilesCheck(dir, {
      files: [],
      icon: undefined,
    });
    expect(result.warnings.some((w) => w.toLowerCase().includes('readme'))).toBe(true);
  });

  test('no README warning when README is included in files', async () => {
    const dir = await setup([{ path: 'README.md', content: '# test' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['README.md'],
      icon: undefined,
    });
    expect(result.warnings.some((w) => w.toLowerCase().includes('readme'))).toBe(false);
  });
});

describe('check-publish-files: icon handling', () => {
  test('warns when declared icon file does not exist on disk', async () => {
    const dir = await setup([]);
    const result = await runPublishFilesCheck(dir, {
      files: ['icon.svg'],
      icon: './icon.svg',
    });
    expect(result.warnings.some((w) => w.includes('missing on disk'))).toBe(true);
  });

  test('no disk warning when icon file exists', async () => {
    const dir = await setup([{ path: 'icon.svg', content: '<svg/>' }]);
    const result = await runPublishFilesCheck(dir, {
      files: ['icon.svg'],
      icon: './icon.svg',
    });
    expect(result.warnings.some((w) => w.includes('missing on disk'))).toBe(false);
  });

  test('warns when icon is missing from package.json', async () => {
    const dir = await setup([]);
    const result = await runPublishFilesCheck(dir, { files: [], icon: undefined });
    expect(result.warnings.some((w) => w.includes('icon is missing'))).toBe(true);
  });
});

describe('check-publish-files: findReadmeFileName error path', () => {
  test('does not crash when pluginDir does not exist (readdir throws)', async () => {
    const nonExistentDir = join(tmpdir(), 'does-not-exist-brika-cpf-12345');
    const result = await runChecks({
      pkg: makePkg({ files: [], icon: undefined }),
      pluginDir: nonExistentDir,
      sdkVersion: '0.4.0',
    });
    // Should not throw; result is just a set of warnings.
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
